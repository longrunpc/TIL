# MQTT Retain 메시지와 메모리 관리

이전에 [MQTT 서버 이해하기 (구독, Push, 브로커)](./2026-06-27-mqtt-broker-pub-sub.md)에서 MQTT의 기본 구조를 정리했다.  
이번에는 그중에서도 `retain`을 어떻게 쓰고, MQTT 서버 메모리 관점에서는 무엇을 조심해야 하는지 정리해보려고 한다.

우리 서비스에서는 카메라나 앱이 MQTT 서버에 연결될 때마다 관련 설정 값을 내려줘야 했다.  
카메라 녹화 설정, 스트리밍 설정, 모션 감지 설정, 앱에서 보여줘야 하는 카메라별 상태 값 같은 것들이다.

이런 값은 매번 API로 다시 조회할 수도 있지만, MQTT를 이미 쓰고 있다면 retained message가 꽤 잘 맞는다.  
브로커가 특정 topic의 마지막 값을 저장해두고 있다가, 새로 구독한 클라이언트에게 즉시 내려줄 수 있기 때문이다.

> retain은 이벤트를 계속 쌓아두는 기능이 아니라, 특정 topic의 마지막 상태값을 broker가 기억하게 하는 기능에 가깝다.

## 1. Retain의 기능

일반 MQTT 메시지는 그 순간 topic을 구독 중인 client에게 전달되고 끝난다.  
반대로 retained message는 broker가 마지막 값을 들고 있다가, 나중에 해당 topic을 구독한 client에게도 바로 전달한다.

예를 들어 카메라 설정을 아래 topic으로 관리할 수 있다.

```text
camera/lobby-01/config
```

payload는 대략 이런 형태다.

```json
{
  "cameraId": "lobby-01",
  "recording": true,
  "motionDetection": true,
  "streamQuality": "720p"
}
```

이 값을 retain으로 publish하면, 카메라가 재부팅되거나 앱이 새로 실행된 뒤 `camera/lobby-01/config`를 구독해도 마지막 설정값을 바로 받을 수 있다.

```bash
mosquitto_pub \
  -h mqtt.example.com \
  -t 'camera/lobby-01/config' \
  -m '{"recording":true,"motionDetection":true,"streamQuality":"720p"}' \
  -r
```

이 구조가 좋은 이유는 단순하다.  
카메라나 앱이 "지금 설정이 뭐지?"를 따로 물어보지 않아도, MQTT 구독만으로 현재 기준의 설정을 받을 수 있다.

## 2. Retain은 topic마다 하나만 저장된다

retain을 쓸 때 가장 먼저 기억해야 하는 건 topic마다 마지막 메시지 하나만 저장된다는 점이다.  
같은 topic에 retained message를 다시 publish하면 이전 값은 새 값으로 덮인다.

```text
camera/lobby-01/config -> {"streamQuality":"480p"} retain
camera/lobby-01/config -> {"streamQuality":"720p"} retain
camera/lobby-01/config -> {"streamQuality":"1080p"} retain
```

이 경우 새로 구독한 client는 마지막 값인 `1080p` 설정만 받는다.  
즉 retain은 history가 아니라 snapshot이다.

그래서 설정 변경 이력이나 이벤트 로그가 필요하면 별도 DB나 로그 저장소가 있어야 한다.  
MQTT retained message는 최신 상태를 빠르게 내려주는 cache처럼 보는 게 맞다.

## 3. 메모리는 retained topic 수와 payload 크기에 영향을 받는다

retain을 쓰면 broker는 retained message를 저장해야 한다.  
즉 retained topic이 많아질수록 broker가 계속 들고 있어야 하는 데이터도 늘어난다.

메모리에 영향을 주는 요소는 대략 이렇다.

1. retained topic 개수
2. retained payload 크기
3. topic 문자열 길이
4. QoS나 metadata
5. broker의 저장 방식과 persistence 설정

설정을 너무 잘게 나누면 topic 수가 빠르게 늘어난다.

```text
camera/lobby-01/config/recording
camera/lobby-01/config/motionDetection
camera/lobby-01/config/streamQuality
camera/lobby-01/config/nightVision
```

카메라가 적을 때는 별문제 없어 보이지만, 카메라 수가 늘어나면 retained topic 수도 같이 늘어난다.  
그래서 설정값이 크지 않다면 아래처럼 카메라 단위 config snapshot 하나로 관리하는 편이 더 단순하다.

```text
camera/{cameraId}/config
```

> retained message는 작은 설정값처럼 보여도 broker 안에 계속 남는 상태다.  
> 카메라 수와 topic 설계가 곧 메모리 설계가 된다.

## 4. Retain으로 관리하면 안 되는 값도 있다

retain은 마지막 상태를 저장하는 기능이라 편하지만, 모든 메시지에 쓰면 안 된다.

먼저 이벤트성 메시지는 retain과 잘 맞지 않는다.

```text
camera/lobby-01/motion
camera/lobby-01/error
camera/lobby-01/event
```

예를 들어 10분 전에 발생한 모션 감지 이벤트가 retained message로 남아 있으면, 앱이 새로 접속했을 때 방금 움직임이 감지된 것처럼 오해할 수 있다.

그리고 큰 payload도 피해야 한다.  
이미지, 영상, 긴 로그 같은 값을 retained message로 넣으면 broker가 계속 들고 있어야 한다. MQTT broker를 파일 저장소처럼 쓰는 구조가 되어버린다.

민감한 값도 조심해야 한다.  
카메라 토큰, 내부 인증키, 관리자 설정처럼 노출되면 위험한 값은 retain으로 남기는 것은 매우 위험한 행동이다.

## 5. 삭제 전략과 현재 메모리 상태

retained message는 새 값으로 덮어쓸 수 있지만, 카메라가 삭제되거나 더 이상 쓰지 않는 topic은 명시적으로 지워야 한다.

MQTT에서는 보통 같은 topic에 빈 payload를 retain으로 publish해서 retained message를 삭제한다.

```bash
mosquitto_pub \
  -h mqtt.example.com \
  -t 'camera/lobby-01/config' \
  -n \
  -r
```

이 작업이 없으면 삭제된 카메라의 설정값이 broker에 계속 남을 수 있다.  
그래서 카메라 삭제나 설정 초기화 흐름에는 DB 정리뿐 아니라 MQTT retained message 삭제도 같이 들어가야 한다.

현재 프로젝트 MQTT 서버는 메모리 가용률이 약 70% 정도다.  
당장 위험한 상태는 아니지만, retained message를 설정값 전달 용도로 계속 늘려갈 계획이라면 지금 숫자만 보고 안심하면 안 된다.(Mqtt 서버가 터지면 모든 서버의 동작에 영향이 미치기 때문에 계속 불안하긴하다.)

특히 아래 기준은 계속 봐야 한다.

1. 카메라 수가 늘어나는 속도
2. 카메라 한 대당 retained topic 수
3. retained payload 평균 크기
4. 메모리 가용률 추이

운영 기준도 숫자로 잡아두는 게 좋다.

```text
event topic에는 retain 사용 금지
삭제된 카메라의 retained topic은 즉시 삭제
config payload는 작게 유지
메모리 가용률이 계속 내려가면 retained topic 정리 또는 broker 증설 검토
```

## 마무리

MQTT retain은 카메라나 앱이 새로 연결될 때 최신 설정값을 바로 내려주기에 좋은 기능이다.  
우리처럼 카메라가 재연결될 때마다 관련 설정을 받아야 하는 구조에서는 꽤 잘 맞는다.

하지만 retain은 broker가 상태를 들고 있는 기능이다.  
그래서 이벤트나 큰 payload에는 쓰지 않고, 카메라 설정처럼 "마지막 상태"가 중요한 값에만 쓰는 게 좋다.

정리하면 이번 기준은 이렇다.

> DB를 설정의 원본으로 두고, MQTT retained message는 최신 설정을 빠르게 전달하는 cache처럼 관리한다.  
> 현재 메모리 가용률은 약 70%로 여유가 있지만, 카메라 수와 retained topic 수가 늘어날 때 같이 모니터링해야 한다.

## 참고 자료

- [MQTT 서버 이해하기 (구독, Push, 브로커)](./2026-06-27-mqtt-broker-pub-sub.md)
- [HiveMQ - What are Retained Messages in MQTT?](https://www.hivemq.com/blog/mqtt-essentials-part-8-retained-messages/)
- [EMQX - MQTT Retained Message](https://docs.emqx.com/en/emqx/latest/messaging/mqtt-retained-message.html)
- [OASIS MQTT Version 5.0 Specification](https://www.oasis-open.org/standard/mqtt-v5-0-os/)
