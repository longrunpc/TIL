# MQTT 서버 이해하기 (구독, Push, 브로커)

MQTT 서버에 대해서 정리해보려고 한다.  
처음 MQTT를 보면 그냥 "메시지를 보내고 받는 서버" 정도로 생각하기 쉬운데, 실제로는 HTTP API 서버와는 구조가 꽤 다르다.

HTTP는 보통 클라이언트가 서버에 요청을 보내고, 서버가 그 요청에 응답하는 방식이다.  
반면 MQTT는 클라이언트들이 특정 주제를 구독해두고, 누군가 그 주제로 메시지를 발행하면 브로커가 구독자들에게 메시지를 전달해주는 방식이다.

그래서 MQTT를 이해할 때는 API endpoint보다 `topic`, `publish`, `subscribe`, `broker`를 먼저 잡고 가는 게 좋다.

> MQTT 서버의 핵심은 "누가 누구에게 직접 보낸다"가 아니라, "브로커가 topic을 기준으로 메시지를 중간에서 전달한다"는 점이다.

## 1. MQTT는 publish/subscribe 구조다

MQTT에서는 메시지를 보내는 쪽을 publisher, 메시지를 받는 쪽을 subscriber라고 볼 수 있다.  
그리고 둘 사이에는 broker가 있다.

```text
Publisher
  -> Broker
  -> Subscriber
```

publisher는 subscriber가 누구인지 몰라도 된다.  
그냥 특정 topic으로 메시지를 발행하면 된다.

예를 들어 IoT 카메라가 움직임을 감지했을 때 아래 topic으로 메시지를 보낸다고 해보자.

```text
camera/lobby-01/motion
```

그러면 이 topic을 구독하고 있는 클라이언트들이 메시지를 받는다.

```text
Subscriber A: camera/lobby-01/motion 구독
Subscriber B: camera/+/motion 구독
Subscriber C: camera/# 구독
```

publisher 입장에서는 A, B, C가 있는지 몰라도 된다.  
브로커가 topic filter를 보고 알아서 전달한다.

이 구조가 MQTT의 가장 큰 특징이다.  
보내는 쪽과 받는 쪽이 서로를 직접 알 필요가 없고, broker를 기준으로 느슨하게 연결된다.

## 2. 구독은 "받고 싶은 topic을 등록하는 것"이다

MQTT의 구독은 단순히 연결만 해두는 게 아니다.  
클라이언트가 broker에게 "나는 이런 topic의 메시지를 받고 싶다"고 등록하는 과정이다.

예를 들어 앱에서 특정 카메라의 연결 상태를 보고 싶다면 아래처럼 구독할 수 있다.

```text
camera/lobby-01/status
```

그러면 누군가 아래 topic으로 메시지를 publish했을 때, broker가 앱 클라이언트에게 전달한다.

```json
{
  "cameraId": "lobby-01",
  "status": "online",
  "recording": true,
  "streaming": false
}
```

구독할 때는 wildcard도 사용할 수 있다.

```text
camera/+/status
camera/#
```

`+`는 topic level 하나를 의미하고, `#`는 그 아래 전체를 의미한다.  
예를 들어 `camera/+/status`는 `camera/lobby-01/status`, `camera/parking-02/status` 같은 topic을 받을 수 있다. 반면 `camera/#`는 `camera/lobby-01/status`, `camera/lobby-01/motion`, `camera/lobby-01/recording`처럼 더 넓은 범위를 받을 수 있다.

> topic의 기준을 잡을때는 완벽하게 문서화를 해놓고, 범위에 대한 적정선을 잘 찾아야 한다.

## 3. MQTT에서 Push는 어떻게 봐야 할까

MQTT를 설명할 때 push라는 표현을 많이 쓰게 된다.  
다만 여기서 말하는 push는 모바일 푸시 알림처럼 OS가 대신 깨워주는 push와는 조금 다르다.

MQTT의 push는 클라이언트가 broker와 연결을 유지하고 있을 때, broker가 새 메시지를 바로 밀어주는 구조에 가깝다.

```text
Client
  -> Broker에 연결
  -> topic 구독
  -> 연결 유지
  <- Broker가 새 메시지를 전달
```

HTTP polling 방식에서는 클라이언트가 계속 서버에 물어봐야 한다.

```text
"새 메시지 있어?"
"아직 없어"
"새 메시지 있어?"
"아직 없어"
"새 메시지 있어?"
"이제 있어"
```

반면 MQTT는 클라이언트가 연결을 유지하고 있으면, broker가 메시지가 생겼을 때 바로 전달한다.

```text
"이 topic 구독할게"
"새 메시지가 생기면 바로 줄게"
```

그래서 실시간성이 필요한 IoT, 채팅성 이벤트, 카메라 연결 상태 변경, 모션 감지 이벤트 같은 곳에서 MQTT가 자주 쓰인다.

다만 주의할 점도 있다.  
MQTT는 연결을 유지해야 push처럼 동작한다. 앱이 완전히 종료되어 있거나 네트워크가 끊겨 있으면, broker 설정과 session 설정에 따라 메시지를 받을 수도 있고 못 받을 수도 있다.

## 4. QoS는 메시지 전달 보장 수준이다

MQTT를 쓸 때는 QoS도 중요하다.  
QoS는 Quality of Service의 줄임말이고, 메시지를 어느 정도 수준으로 전달 보장할지를 정하는 옵션이다.

MQTT에는 보통 세 가지 QoS가 있다.

| QoS | 의미 | 특징 |
| --- | --- | --- |
| `0` | at most once | 한 번만 보낸다. 유실될 수 있지만 가장 가볍다. |
| `1` | at least once | 최소 한 번은 전달한다. 중복 수신 가능성이 있다. |
| `2` | exactly once | 정확히 한 번 전달을 목표로 한다. 가장 무겁다. |

카메라의 현재 스트리밍 상태처럼 최신 값만 중요하면 QoS 0도 충분할 수 있다.  
하지만 녹화 시작/중지 명령이나 보안 이벤트처럼 유실되면 곤란한 메시지는 QoS 1 이상을 고려해야 한다.

여기서 중요한 건 QoS가 높다고 무조건 좋은 게 아니라는 점이다.  
QoS가 올라가면 broker와 client 사이에 확인 과정이 늘어나고, 그만큼 지연이나 부하도 늘 수 있다.

> MQTT는 가볍게 쓸 수 있는 프로토콜이지만, QoS와 session 설정을 잘못 잡으면 생각보다 복잡해진다.

## 5. Broker는 MQTT의 중심이다

MQTT에서 broker는 메시지를 중계하는 서버다.  
publisher가 보낸 메시지를 받고, topic을 기준으로 subscriber에게 전달한다.

broker가 하는 일은 대략 이렇다.

1. client 연결을 관리한다.
2. client 인증과 권한을 확인한다.
3. publish 메시지를 받는다.
4. topic filter에 맞는 subscriber를 찾는다.
5. QoS 정책에 맞게 메시지를 전달한다.
6. 필요하면 retained message나 session 정보를 관리한다.

그래서 MQTT 서버를 고른다는 건 단순히 "메시지를 받을 수 있나"만 보는 게 아니다.  
동시 접속 수, topic 수, 인증 방식, 클러스터링, 모니터링, 운영 편의성, 라이선스, 언어 기반까지 같이 봐야 한다.

## 6. 대표적인 MQTT Broker 종류

MQTT broker는 여러 종류가 있다.  
각각 방향성이 조금 다르기 때문에, "무조건 이것이 좋다"보다는 현재 서비스 구조에 맞는 걸 고르는 게 중요하다.

| Broker | 기반 언어/런타임 | 특징 | 장점 | 단점 |
| --- | --- | --- | --- | --- |
| Mosquitto | C 중심 | 가장 많이 알려진 경량 MQTT broker | 가볍고 단순하다. 로컬 개발, 소규모 서비스, 테스트에 좋다. | 대규모 클러스터링이나 엔터프라이즈 기능은 별도 구성이 필요하다. |
| EMQX | Erlang/OTP | 대규모 분산 MQTT broker | 클러스터링, 대량 연결, 대시보드, 규칙 엔진 쪽이 강하다. | 기능이 많은 만큼 처음 운영할 때 학습 비용이 있다. |
| RabbitMQ MQTT Plugin | Erlang/OTP 기반 RabbitMQ | RabbitMQ에 MQTT plugin을 붙이는 방식 | 이미 RabbitMQ를 쓰는 조직이면 기존 메시징 인프라와 같이 볼 수 있다. | 순수 MQTT broker처럼 쓰기보다는 RabbitMQ 생태계 안에서 판단해야 한다. |
| AWS IoT Core | Managed Service | AWS가 운영하는 MQTT 기반 IoT 메시징 서비스 | broker 운영 부담이 적고 AWS IAM, 인증서, Rule Engine과 연결하기 좋다. | 직접 broker를 튜닝하는 자유도는 낮고, 비용과 AWS 종속성을 고려해야 한다. |

개인적으로 처음 MQTT를 테스트하거나 작은 서비스를 만든다면 Mosquitto가 가장 접근하기 쉽다.  
반대로 처음부터 동시 연결이 많고 클러스터링, 대시보드, Rule Engine까지 필요하다면 EMQX와 같은 선택지가 더 현실적일 수 있다.

AWS 인프라 안에서 IoT 디바이스 인증서, Rule Engine, Lambda/SQS/DynamoDB 연동까지 같이 쓰고 싶다면 AWS IoT Core도 좋은 선택지다.  
다만 이 경우에는 broker를 직접 운영한다기보다 managed MQTT 서비스를 사용하는 것에 가깝다.

## 7. Mosquitto 선택 이유와 추후 개선 사항

현재 내가 담당하고 있는 MQTT 서버는 Mosquitto로 구현되어 있다.  
EMQX, HiveMQ, VerneMQ 같은 다른 broker들도 선택지에 있었지만, 결국 가볍고 단순한 Mosquitto를 선택한 상태다.

물론 처음부터 모든 broker를 깊게 비교해서 선택했다기보다는, 초창기에 Mosquitto를 사용했고 지금까지 계속 이어서 사용하고 있는 흐름에 가깝다.  
Mosquitto는 C 기반이라 가볍고, 설정도 비교적 단순하다. 우리가 MQTT로 하고 싶은 일이 복잡한 rule engine이나 대규모 클러스터링보다는 카메라와 앱 사이의 pub/sub, 설정값 전달, 상태 전달에 가까웠기 때문에 초기 선택으로는 충분히 자연스러웠다.

**다만 계속 Mosquitto만 쓰는 게 최선인지는 아직 더 확인해보고 싶다.**

MQTT broker는 표면적으로는 다 비슷해 보여도, 실제 운영에서는 연결 수, retained message 관리, 인증 방식, metric 확인, 메모리 사용량, 장애 복구 방식에서 차이가 생길 수 있다.

그래서 나도 다른 broker가 없나 찾아보고 있고, 실제로 적용해볼 생각이다.  
우선적으로 보고 있는 건 Mochi MQTT다. Mochi MQTT는 Go 기반으로 MQTT broker를 라이브러리처럼 코드에 포함해서 구축할 수 있는 방식이라, 단순히 broker process를 띄우는 것보다 애플리케이션 로직과 더 가깝게 붙여볼 수 있다는 점이 흥미로웠다.

예를 들면 이런 방향을 생각해볼 수 있다.

```text
기존 구조
  -> Mosquitto broker 별도 운영
  -> 애플리케이션 서버가 MQTT topic publish/subscribe

검토 중인 구조
  -> Go 애플리케이션 안에 Mochi MQTT broker 구성
  -> 인증, topic 제어, metric 수집을 애플리케이션 코드와 더 가깝게 관리
```

물론 이게 무조건 더 좋다는 뜻은 아니다.  
기존에도 나처럼 다른 broker를 써보려고 시도한 사람들이 몇 명 있었던 것 같은데, 이상하게 성능이 더 떨어졌다는 이야기가 있었다. 왜 그런지는 아직 모르겠다. broker 자체의 문제였는지, 설정 문제였는지, 테스트 조건 문제였는지, retained message나 QoS 설정이 달랐는지는 실제로 봐야 알 것 같다.

그래서 이 부분은 아직 결론을 내리기보다는 실험 대상으로 남겨두고 있다.

> 지금은 Mosquitto가 가볍고 단순해서 잘 맞지만, 앞으로 카메라 수나 retained message가 늘어나면 다른 broker도 실제 트래픽 기준으로 비교해봐야 한다.  
> 추후 Mochi MQTT를 적용해보면, 그때 다시 성능과 운영 경험을 정리해보려고 한다.

## 마무리

MQTT는 단순히 "메시지를 보내는 서버"라기보다, publisher와 subscriber를 broker가 topic 기준으로 연결해주는 구조다.  
그래서 HTTP API처럼 "이 endpoint를 호출하면 이 응답이 온다"는 방식으로 이해하면 조금 헷갈릴 수 있다.

MQTT에서 중요한 건 이 흐름이다.

```text
구독자가 topic을 구독한다.
발행자가 topic으로 메시지를 보낸다.
broker가 topic filter에 맞는 구독자에게 메시지를 전달한다.
```

이 구조 덕분에 실시간 이벤트, IoT 카메라 상태, 모션 감지, 녹화 상태, 알림성 메시지를 가볍게 처리할 수 있다.  
대신 broker 선택, QoS, topic naming, 인증, session, retained message까지 같이 설계해야 운영에서 덜 흔들린다.

정리하면 MQTT 서버를 고를 때는 이렇게 보면 될 것 같다.

> 현재 우리 서버는 Mosquitto로 운영하고 있고, 가볍고 단순하다는 점에서는 아직 잘 맞는다.  
> 다만 앞으로는 Mochi MQTT 같은 다른 broker도 실제 트래픽과 retained message 기준으로 비교해보고, 어떤 broker를 쓰든 제일 오래 남는 설계는 topic 구조라는 점을 계속 봐야 한다.

## 참고 자료

- [Eclipse Mosquitto](https://mosquitto.org/)
- [EMQX Documentation](https://docs.emqx.com/)
- [Mochi MQTT](https://github.com/mochi-mqtt/server)
