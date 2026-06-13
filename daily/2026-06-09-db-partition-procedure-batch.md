# DB 파티션 분할과 프로시저 배치 처리

KCP 본인인증 v2 마이그레이션을 하면서 `cert_kcp` 테이블을 따로 만들었는데, 단순히 데이터를 저장하는 것보다 더 고민됐던 부분은 "이 데이터가 계속 쌓이면 어떻게 관리하지?"였다.  
본인인증 요청은 매일 들어오고, 인증이 끝난 뒤에는 오래 들고 있을 필요가 없는 데이터도 많다. 그래서 이번에는 `reg_date` 기준으로 하루 단위 파티션을 나누고, 프로시저를 배치에서 호출해서 파티션을 관리하는 방식까지 같이 생각했다.

처음에는 그냥 인덱스만 잘 잡으면 되지 않을까 싶었는데, 인증 데이터처럼 날짜 기준으로 쌓이고 날짜 기준으로 정리되는 데이터는 파티션이 꽤 잘 맞는 케이스였다.

> 파티션은 조회를 무조건 빠르게 만드는 기능이라기보다, 큰 테이블을 날짜나 범위 기준으로 작게 나눠서 조회와 정리 비용을 줄이는 방식에 가깝다.

## 파티션을 왜 나누는지

파티션은 하나의 논리 테이블을 여러 조각으로 나누는 방식이다.  
애플리케이션에서는 여전히 `cert_kcp`라는 하나의 테이블을 조회하지만, DB 내부에서는 `reg_date` 값에 따라 `p20260609`, `p20260610` 같은 파티션에 데이터를 나눠서 저장한다.

예를 들어 KCP 본인인증 요청 데이터는 이런 특징이 있었다.

- 인증 요청이 매일 계속 쌓인다.
- 최근 데이터는 자주 조회하지만, 오래된 데이터는 거의 조회하지 않는다.
- 일정 기간이 지나면 삭제하거나 정리해야 한다.
- 장애나 CS 대응 위해 날짜 기준으로 데이터를 확인할 일이 있다.

이런 데이터는 그냥 하나의 테이블에 계속 넣어두면 시간이 지날수록 관리가 피곤해진다.  
특히 오래된 데이터를 지울 때 `DELETE FROM cert_kcp WHERE reg_date < ...` 같은 방식으로 대량 삭제를 하면, 데이터 양에 따라 락이나 I/O 부담이 커질 수 있다.

반면 날짜 단위 파티션으로 나누면 오래된 날짜의 파티션을 통째로 제거할 수 있다.

```sql
ALTER TABLE cert_kcp DROP PARTITION p20260501;
```

이건 해당 파티션에 들어 있는 데이터가 전부 삭제된다는 뜻이라 조심해야 하지만, 보관 기간이 정해진 로그성/이력성 데이터에서는 꽤 깔끔한 정리 방식이 된다.

> KCP 인증 데이터에서는 파티션을 "빠른 조회"보다 "운영 중 정리하기 쉬운 구조"로 구현하도록 계획했다.

## KCP v2 예시로 본 테이블 구조

이번에 생각한 테이블은 대략 이런 식이다.

```sql
CREATE TABLE cert_kcp (
  idx BIGINT NOT NULL AUTO_INCREMENT,
  ordr_idxx VARCHAR(100) NOT NULL,
  reg_cert_key VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL,
  email VARCHAR(255) NOT NULL,
  reg_date DATETIME NOT NULL,
  completed_date DATETIME NULL,
  PRIMARY KEY (idx, reg_date),
  KEY ix_cert_kcp_ordr_idxx (ordr_idxx),
  KEY ix_cert_kcp_status_reg_date (status, reg_date)
)
PARTITION BY RANGE COLUMNS (reg_date) (
  PARTITION p20260609 VALUES LESS THAN ('2026-06-10'),
  PARTITION pmax VALUES LESS THAN (MAXVALUE)
);
```

여기서 핵심은 `reg_date`를 파티션 기준으로 잡은 부분이다.  
2026년 6월 9일에 들어온 데이터는 `p20260609` 파티션에 들어가고, 그 이후 미리 만들어두지 못한 데이터는 임시로 `pmax`에 들어가도록 잡을 수 있다. 운영에서는 보통 다음 날 또는 며칠 뒤 파티션을 미리 만들어둬서 `pmax`에 데이터가 쌓이지 않게 관리한다.

그리고 MySQL/MariaDB에서 주의할 점이 하나 있다.  
파티션 키로 쓰는 컬럼은 모든 UNIQUE KEY에 포함되어야 한다. PRIMARY KEY도 UNIQUE KEY의 한 종류라서, `reg_date`로 파티션을 나누려면 `PRIMARY KEY (idx, reg_date)`처럼 파티션 키를 같이 넣어줘야 한다.

그 이유로 원래는 `reg_cert_key`를 유니크 키로 설정하려고 하였으나, `reg_date `도 함께 설정해야되는 이유로 성능 저하 및 인덱스 크기가 증가될 우려로 애플리케이션 레벨에서 중복검사를 하도록 수정하였다.

> MySQL/MariaDB에서 `reg_date` 기준으로 파티션을 나누면서 `PRIMARY KEY (idx)`만 두면 에러가 날 수 있다. 파티션 키는 UNIQUE KEY 구성에도 같이 들어가야 한다.

## 파티션이 조회를 빠르게 만드는 조건

파티션을 나누면 항상 조회가 빨라지는 건 아니다.  
DB가 필요한 파티션만 읽고 나머지를 건너뛰는 것을 보통 partition pruning이라고 하는데, 이게 되려면 쿼리 조건에 파티션 키가 잘 들어가야 한다.

예를 들면 이런 쿼리는 `reg_date` 범위를 알 수 있어서 필요한 날짜 파티션만 확인할 수 있다.

```sql
SELECT *
FROM cert_kcp
WHERE reg_date >= '2026-06-09'
  AND reg_date < '2026-06-10';
```

반대로 이런 쿼리는 `ordr_idxx`만 보고 찾기 때문에, 날짜 파티션을 바로 줄이기 어렵다.

```sql
SELECT *
FROM cert_kcp
WHERE ordr_idxx = 'KCP-20260609-0001';
```

그래서 KCP 인증 결과 콜백처럼 `ordr_idxx`로 단건을 찾는 흐름에서는 파티션보다 인덱스가 더 중요하다.  
파티션은 날짜 기준 조회, 오래된 데이터 정리, 운영 관리 쪽에서 더 빛을 보는 구조였다.

> 파티션은 인덱스를 대체하지 않는다. `ordr_idxx`로 찾을 일이 있으면 그 컬럼에는 여전히 인덱스가 필요하다.

## 하루 단위 파티션을 잡은 이유

파티션 단위는 서비스 데이터 성격에 맞춰야 한다.  
월 단위로 나눌 수도 있고, 주 단위로 나눌 수도 있는데, 이번에는 하루 단위가 더 맞다고 봤다.

KCP 인증 데이터는 하루 기준으로 들어오는 양을 보기 쉽고, 보관 기간도 날짜 기준으로 정리하기 쉽다.  
예를 들어 30일만 보관한다면 오늘 기준 31일 전 파티션을 제거하면 된다.

```sql
ALTER TABLE cert_kcp DROP PARTITION p20260509;
```

물론 하루 단위 파티션은 파티션 개수가 빠르게 늘어난다는 단점도 있다.  
그래서 보관 기간이 너무 길거나 데이터 양이 적다면 월 단위 파티션이 더 나을 수도 있다. 이번 케이스에서는 인증성 데이터이고, 오래된 데이터는 정리 대상이라 하루 단위로 가져가는 게 더 자연스럽다고 판단했다.

## 프로시저로 파티션을 관리하는 방식

파티션은 한 번 만들어놓고 끝나는 게 아니다.  
날짜가 계속 바뀌기 때문에 미래 파티션을 만들어줘야 하고, 보관 기간이 지난 파티션은 정리해줘야 한다.

이걸 매번 사람이 직접 하면 실수하기 쉽다.  
그래서 DB 프로시저로 "내일 파티션 만들기"와 "오래된 파티션 삭제하기"를 묶고, 배치에서 그 프로시저를 호출하는 방식으로 생각했다.

### 다음 날짜 파티션 만들기

`pmax` 파티션을 두고, 새 날짜 파티션이 필요할 때 `pmax`를 쪼개는 방식으로 관리할 수 있다.

```sql
DELIMITER //

CREATE PROCEDURE ensure_cert_kcp_partition(IN target_date DATE)
BEGIN
  DECLARE partition_exists INT DEFAULT 0;
  DECLARE partition_name VARCHAR(20);
  DECLARE less_than_value VARCHAR(10);

  SET partition_name = CONCAT('p', DATE_FORMAT(target_date, '%Y%m%d'));
  SET less_than_value = DATE_FORMAT(DATE_ADD(target_date, INTERVAL 1 DAY), '%Y-%m-%d');

  SELECT COUNT(*)
    INTO partition_exists
    FROM information_schema.PARTITIONS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'cert_kcp'
     AND PARTITION_NAME = partition_name;

  IF partition_exists = 0 THEN
    SET @sql = CONCAT(
      'ALTER TABLE cert_kcp REORGANIZE PARTITION pmax INTO (',
      'PARTITION ', partition_name, ' VALUES LESS THAN (''', less_than_value, '''), ',
      'PARTITION pmax VALUES LESS THAN (MAXVALUE))'
    );

    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END//

DELIMITER ;
```

이 프로시저는 특정 날짜를 받아서 해당 날짜 파티션이 없으면 새로 만든다.  
운영에서는 오늘 기준으로 내일, 모레 정도 파티션을 미리 만들어두면 조금 더 마음이 편하다.

### 오래된 파티션 삭제하기

보관 기간이 지난 데이터는 날짜 기준 파티션을 삭제하는 방식으로 처리할 수 있다.

```sql
DELIMITER //

CREATE PROCEDURE drop_cert_kcp_partition(IN target_date DATE)
BEGIN
  DECLARE partition_exists INT DEFAULT 0;
  DECLARE partition_name VARCHAR(20);

  SET partition_name = CONCAT('p', DATE_FORMAT(target_date, '%Y%m%d'));

  SELECT COUNT(*)
    INTO partition_exists
    FROM information_schema.PARTITIONS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'cert_kcp'
     AND PARTITION_NAME = partition_name;

  IF partition_exists = 1 THEN
    SET @sql = CONCAT('ALTER TABLE cert_kcp DROP PARTITION ', partition_name);

    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END//

DELIMITER ;
```

`DROP PARTITION`은 해당 파티션의 데이터를 실제로 제거한다.  
그래서 실서비스에서는 보관 기간, 개인정보 정책, 감사 로그 필요 여부를 확인하고 적용해야 한다.

### 한 번에 묶어서 호출하기

실제로는 배치에서 아래처럼 하나의 관리 프로시저만 호출하게 만들 수 있다.

```sql
DELIMITER //

CREATE PROCEDURE maintain_cert_kcp_partitions(IN run_date DATE)
BEGIN
  CALL ensure_cert_kcp_partition(DATE_ADD(run_date, INTERVAL 1 DAY));
  CALL ensure_cert_kcp_partition(DATE_ADD(run_date, INTERVAL 2 DAY));
  CALL drop_cert_kcp_partition(DATE_SUB(run_date, INTERVAL 31 DAY));
END//

DELIMITER ;
```

이렇게 해두면 배치 쪽에서는 복잡한 DDL을 몰라도 된다.

```sql
CALL maintain_cert_kcp_partitions(CURRENT_DATE);
```

> 배치는 "언제 실행할지"를 담당하고, 프로시저는 "무엇을 정리할지"를 담당하게 나누면 관리하기가 훨씬 편했다.

## 배치 처리 방식들

파티션 관리 배치는 몇 가지 방식으로 돌릴 수 있다.(현방식은 프로시져 호출로 관리하고 있다.)

### 1. DB Event Scheduler 사용

MySQL/MariaDB에는 Event Scheduler가 있어서 DB 안에서 정해진 시간마다 SQL을 실행할 수 있다.

```sql
CREATE EVENT ev_maintain_cert_kcp_partitions
ON SCHEDULE EVERY 1 DAY
STARTS '2026-06-10 00:10:00'
DO
  CALL maintain_cert_kcp_partitions(CURRENT_DATE);
```

이 방식은 DB 안에서 끝나기 때문에 구조가 단순하다.  
다만 이벤트 스케줄러가 켜져 있어야 하고, 실행 실패를 어떻게 모니터링할지 따로 봐야 한다. 운영 로그나 알림을 애플리케이션 쪽에서 관리하고 싶다면 조금 답답할 수 있다.

### 2. 애플리케이션 배치에서 호출

Spring Scheduler, Node cron, 서버 cron 같은 곳에서 `CALL maintain_cert_kcp_partitions(CURRENT_DATE)`만 호출하는 방식도 가능하다.  
개인적으로는 운영 관점에서 이 방식이 더 익숙하다. 애플리케이션 로그, 에러 알림, 재시도 처리를 붙이기가 더 편하기 때문이다.

```ts
await db.execute("CALL maintain_cert_kcp_partitions(CURRENT_DATE)");
```

이 방식에서는 DB가 파티션 관리 로직을 가지고 있고, 애플리케이션은 정해진 시간에 호출만 한다.  
프로시저를 쓰는 이유도 여기에 있다. 파티션 DDL을 애플리케이션 코드에 직접 문자열로 들고 있기보다, DB에 가까운 곳에 두는 게 더 자연스럽다고 느꼈다.

### 3. 외부 스케줄러 사용

Jenkins, Airflow, Kubernetes CronJob 같은 외부 스케줄러에서 호출할 수도 있다.  
배치가 많고 실행 이력, 실패 재시도, 알림을 한 곳에서 관리하고 있다면 이 방식이 더 깔끔하다.

다만 이번 KCP 인증 데이터처럼 작업이 단순한 경우에는 너무 큰 도구를 붙이는 느낌일 수도 있다.  
그래서 작은 서비스라면 애플리케이션 배치나 DB Event Scheduler로 시작하고, 배치가 많아지면 외부 스케줄러로 옮기는 식이 현실적인 것 같다.

## MySQL/MariaDB에서 파티션을 쓸 때 조심할 점

MySQL과 MariaDB의 파티션은 비슷한 느낌으로 사용할 수 있지만, 몇 가지 제약을 알고 있어야 한다.

첫 번째는 앞에서 말한 UNIQUE KEY 제약이다.  
파티션 키로 쓰는 컬럼은 모든 UNIQUE KEY에 포함되어야 한다. `reg_date`로 파티션을 나눴다면 `PRIMARY KEY (idx, reg_date)`처럼 잡아야 하는 이유가 이거다.

두 번째는 파티션이 병렬 조회를 보장하지 않는다는 점이다.  
MariaDB 문서에서도 여러 파티션을 조회한다고 해서 쿼리가 자동으로 병렬화되는 건 아니라고 설명한다. 그래서 파티션을 "병렬 처리 장치"처럼 생각하면 기대와 다를 수 있다.

세 번째는 외래키 제약이다.  
MariaDB는 partitioned table에 foreign key를 두거나 참조하는 데 제한이 있다. 그래서 인증 이력처럼 독립적으로 관리되는 테이블에는 잘 맞지만, 강한 FK 관계가 필요한 테이블에는 불편할 수 있다.

> MySQL/MariaDB 파티션은 대용량 데이터를 나눠 관리하기에는 좋지만, PK/UNIQUE KEY와 FK 제약 때문에 테이블 설계 단계에서 미리 맞춰봐야 한다.

## 다른 DB에서는 조금 다르게 접근한다

파티션이라는 개념은 비슷하지만, DB마다 구현 방식과 운영 포인트는 조금 다르다.

### PostgreSQL

PostgreSQL은 declarative partitioning 방식으로 부모 테이블을 만들고, 실제 데이터를 담는 파티션 테이블을 붙이는 느낌이 강하다.  
공식 문서에서도 오래된 파티션을 제거하고 새 파티션을 주기적으로 추가하는 일이 흔하다고 설명한다. 그래서 파티션을 생성하는 DDL을 스크립트로 자동화하는 흐름이 자연스럽다.

KCP 예시로 보면 `cert_kcp` 부모 테이블을 만들고, 날짜별 child partition을 계속 붙였다 떼는 방식으로 생각할 수 있다.

### SQL Server

SQL Server는 partition function과 partition scheme을 따로 만든다.  
partition function은 어떤 값이 어느 파티션으로 갈지를 정하고, partition scheme은 그 파티션을 어느 filegroup에 둘지를 정한다.  
그래서 MySQL/MariaDB보다 저장소 배치 관점이 더 명확하게 드러나는 느낌이다.

### Oracle

Oracle은 파티션 기능이 오래되고 선택지가 많은 편이다.  
테이블과 인덱스를 더 작은 단위로 나눠서 관리하고, SQL에서는 보통 투명하게 접근한다. 큰 엔터프라이즈 환경이나 데이터웨어하우스 쪽에서는 파티션 전략 자체가 꽤 중요한 설계 포인트가 된다.

### MySQL/MariaDB와 비교하면

MySQL/MariaDB는 상대적으로 문법은 단순하게 시작할 수 있지만, UNIQUE KEY 제약이나 FK 제한 같은 부분을 신경 써야 한다.  
PostgreSQL은 파티션을 테이블 계층처럼 다루는 느낌이 있고, SQL Server는 partition function/scheme과 filegroup이 핵심이고, Oracle은 기능 폭이 넓다.

그래서 파티션은 "DB마다 같은 이름의 기능"이라고 해서 똑같이 쓰면 안 되고, 실제 운영 방식은 각 DB의 제약과 강점에 맞춰 잡아야 한다.

## 마무리

이번 KCP v2 마이그레이션에서 `cert_kcp`를 파티션으로 나누려고 한 이유는 단순히 조회를 빠르게 하고 싶어서만은 아니었다.  
오히려 인증 데이터가 계속 쌓였을 때 오래된 데이터를 어떻게 정리할지, 날짜별로 어떻게 운영할지, 배치가 실패했을 때 어디까지 책임을 나눌지 같은 부분이 더 중요했다.

파티션은 잘 쓰면 운영이 편해지지만, 잘못 쓰면 테이블 설계만 복잡해지고 기대한 성능 효과는 못 볼 수도 있다.  
그래서 이번에는 `reg_date` 기준 하루 단위 파티션, `ordr_idxx` 인덱스, 프로시저 기반 관리 배치라는 식으로 역할을 나눠서 생각했다.

개인적으로 정리하면 이렇다.

> 날짜 기준으로 쌓이고, 날짜 기준으로 지워야 하는 데이터라면 파티션을 고민해볼 만하다.  
> 다만 단건 조회 성능은 파티션보다 인덱스가 더 중요하고, 파티션은 운영 관리 비용을 줄이는 쪽에서 주로 사용한다.

## 참고 자료

- [MySQL 8.4 Reference Manual - Partitioning](https://dev.mysql.com/doc/refman/8.4/en/partitioning.html)
- [MySQL 8.4 Reference Manual - Partition Pruning](https://dev.mysql.com/doc/refman/8.4/en/partitioning-pruning.html)
