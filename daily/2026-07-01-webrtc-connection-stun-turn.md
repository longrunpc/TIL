# WebRTC 연결 방식과 STUN/TURN 서버

WebRTC에 대해서 정리해보려고 한다.  
처음 WebRTC를 보면 "영상 스트리밍 기술" 정도로 생각하기 쉬운데, RTSP나 RTMPS 같은 기존 스트리밍 프로토콜과는 구조가 꽤 다르다.

RTSP나 RTMPS는 보통 클라이언트가 미디어 서버와 통신하는 구조에 가깝다.  
반면 WebRTC는 브라우저나 앱끼리 실시간으로 오디오, 비디오, 데이터를 주고받기 위해 만들어진 P2P 기반 기술이다.

> WebRTC를 이해할 때 핵심은 "영상을 어디로 업로드하느냐"보다, "서로 연결 가능한 네트워크 경로를 어떻게 찾고, 그 경로로 암호화된 미디어를 어떻게 주고받느냐"이다.

## WebRTC의 실시간 양방향 통신

WebRTC는 브라우저나 앱에서 플러그인 없이 실시간 통신을 할 수 있게 해준다.  
주로 화상 통화, 음성 통화, 화면 공유, 실시간 카메라 영상, 데이터 채널 같은 곳에서 사용된다.

WebRTC에서 주로 다루는 것은 세 가지다.

1. 오디오와 비디오 같은 media stream
2. 파일 조각이나 제어 메시지를 보낼 수 있는 data channel
3. NAT 환경에서도 연결을 만들기 위한 ICE, STUN, TURN

WebRTC가 조금 어려운 이유는 단순히 "서버 URL로 접속하면 끝"이 아니기 때문이다.  
두 client가 서로 통신하려면 먼저 서로의 네트워크 정보와 미디어 정보를 교환해야 하고, 실제로 연결 가능한 경로도 찾아야 한다.

즉 WebRTC 연결에는 크게 두 단계가 있다.

```text
1. signaling으로 연결에 필요한 정보를 교환한다.
2. ICE/STUN/TURN을 통해 실제 미디어가 흐를 경로를 찾는다.
```

여기서 signaling은 WebRTC 자체가 정해주는 프로토콜이 아니다.  
서비스가 직접 WebSocket, HTTP, MQTT 같은 방식으로 구현해야 한다.

## WebRTC 연결에는 signaling 서버가 필요하다

WebRTC는 peer끼리 직접 미디어를 주고받을 수 있지만, 처음부터 서로를 찾을 수 있는 것은 아니다.  
상대방에게 "내가 어떤 코덱을 지원하는지", "어떤 네트워크 후보 주소를 가지고 있는지", "어떤 암호화 정보로 통신할지"를 알려줘야 한다.

이 정보를 주고받는 통로가 signaling 서버다.

```text
Client A
  -> signaling server
  -> Client B

Client B
  -> signaling server
  -> Client A
```

signaling 서버가 주고받는 대표적인 정보는 SDP와 ICE candidate다.

SDP는 미디어 협상 정보에 가깝다.

```text
어떤 오디오/비디오 코덱을 쓸 수 있는지
미디어 방향이 sendonly인지 recvonly인지 sendrecv인지
DTLS fingerprint가 무엇인지
```

ICE candidate는 연결 후보 주소에 가깝다.

```text
내 로컬 네트워크 주소
STUN으로 알아낸 공인 IP/port
TURN relay 주소
```

중요한 점은 signaling 서버가 보통 미디어를 직접 전달하지 않는다는 것이다.  
signaling은 연결 협상을 위한 중간 통로이고, 실제 오디오/비디오는 ICE로 선택된 경로를 통해 흐른다.

## WebRTC 핸드셰이크 과정

WebRTC 연결 과정을 단순화하면 아래와 같다.

```text
Client A                                  Client B
   |                                         |
   | createOffer                            |
   | setLocalDescription                    |
   | ---- offer SDP ----------------------> |
   |                                         | setRemoteDescription
   |                                         | createAnswer
   |                                         | setLocalDescription
   | <--- answer SDP ---------------------- |
   | setRemoteDescription                   |
   |                                         |
   | <------ ICE candidates exchange ------> |
   |                                         |
   | <------ ICE connectivity checks ------> |
   |                                         |
   | <---------- DTLS handshake ----------> |
   |                                         |
   | <========== SRTP media flow =========> |
```

간단하게 보면 3단계로 정리할 수 있다.

1. SDP offer/answer로 어떤 미디어를 주고받을지 협상한다.
2. ICE candidate를 교환하고 실제 연결 가능한 네트워크 경로를 찾는다.
3. DTLS handshake 이후 SRTP로 암호화된 오디오/비디오를 주고받는다.

여기서 offer/answer만 끝났다고 바로 영상이 흐르는 것은 아니다.  
SDP는 "무엇을 주고받을지"를 합의하는 과정이고, ICE는 "어떤 네트워크 경로로 연결할지"를 찾는 과정이다.

> WebRTC 핸드셰이크는 SDP offer/answer, ICE candidate 교환, ICE connectivity check, DTLS handshake가 이어지는 흐름으로 봐야 한다.

## STUN 서버의 역할

대부분의 client는 NAT 뒤에 있다.  
예를 들어 집 공유기나 회사 네트워크 안에 있으면, client가 알고 있는 자기 IP는 `192.168.x.x` 같은 사설 IP일 수 있다.

문제는 이 주소를 상대방에게 알려줘도 외부에서는 직접 접속할 수 없다는 점이다.  
그래서 client는 "내가 외부에서 어떤 IP와 port로 보이는지"를 알아야 한다.

이때 STUN 서버를 사용한다.

```text
Client
  -> STUN server
  <- 외부에서 보이는 IP/port
```

STUN 서버는 미디어를 중계하지 않는다.  
그냥 client가 NAT 밖에서 어떤 주소로 보이는지 확인하는 데 도움을 준다.

예를 들어 client가 STUN 서버에 요청을 보내면, STUN 서버는 "너는 외부에서 `203.0.113.10:52341`처럼 보인다"는 식의 정보를 알려준다.  
이 정보가 ICE candidate 중 하나로 상대방에게 전달된다.

STUN은 가볍고 비용도 적다.  
하지만 NAT나 방화벽 환경에 따라 STUN만으로는 직접 연결이 안 될 수 있다.

## TURN 서버의 역할

TURN 서버는 직접 연결이 안 될 때 사용하는 relay 서버다.  
STUN은 "내 외부 주소를 알아내는 역할"이고, TURN은 "미디어를 대신 중계하는 역할"이다.

```text
Client A
  -> TURN server
  -> Client B
```

방화벽이 강하거나, 양쪽 NAT 조합이 직접 연결을 허용하지 않으면 peer-to-peer 연결이 실패할 수 있다.  
이때 TURN 서버를 통해 미디어를 보내면 연결 성공률을 높일 수 있다.

대신 비용이 생긴다.  
TURN은 실제 오디오/비디오 트래픽을 중계하기 때문에 서버 대역폭과 CPU를 사용한다. 특히 영상은 트래픽이 크기 때문에 TURN 사용량이 많아지면 비용이 빠르게 늘 수 있다.

그래서 일반적으로는 이런 순서로 연결을 시도한다.

```text
1. host candidate: 로컬 네트워크에서 직접 연결
2. srflx candidate: STUN으로 얻은 공인 주소로 직접 연결
3. relay candidate: TURN 서버를 통한 중계 연결
```

TURN은 fallback에 가깝다.  
없으면 특정 네트워크에서 연결이 실패할 수 있고, 너무 많이 쓰면 비용이 커진다.

> STUN은 길을 찾는 데 도움을 주고, TURN은 길이 없을 때 직접 다리를 놓아주는 서버라고 보면 된다.

## RTSP, RTMPS와 WebRTC의 차이

WebRTC를 이해하려면 RTSP, RTMPS와 비교해보는 게 좋다.  
셋 다 영상과 관련이 있지만 목적과 구조가 다르다.

| 구분 | WebRTC | RTSP | RTMPS |
| --- | --- | --- | --- |
| 주요 목적 | 실시간 양방향 통신 | 카메라/미디어 서버 스트림 제어 | 방송 송출/서버 ingest |
| 연결 구조 | P2P 기반 | client-server | client-server |
| 지연 시간 | 매우 낮게 설계됨 | 비교적 낮지만 환경 의존 | WebRTC보다 보통 높음 |
| 브라우저 지원 | 브라우저 API로 지원 | 브라우저 직접 재생은 제한적 | 브라우저 직접 재생은 일반적이지 않음 |
| NAT traversal | ICE/STUN/TURN 사용 | 별도 네트워크 구성이 필요할 수 있음 | 보통 서버로 송출 |
| 대표 사용처 | 화상 통화, 실시간 관제, 양방향 제어 | IP 카메라, CCTV, NVR | 라이브 방송 송출, 플랫폼 ingest |

RTSP는 IP 카메라나 CCTV 쪽에서 많이 볼 수 있다.  
카메라가 RTSP stream을 제공하고, client나 NVR이 그 stream을 받아보는 구조가 많다. 미디어 제어에는 좋지만 브라우저에서 바로 재생하기는 불편한 경우가 많다.

RTMPS는 RTMP에 TLS를 붙인 형태로, 보통 방송 송출 쪽에서 많이 쓰인다.  
OBS 같은 encoder가 RTMPS로 미디어 서버나 방송 플랫폼에 영상을 밀어 넣고, 시청자는 보통 HLS/DASH 같은 다른 프로토콜로 보는 구조가 많다.

WebRTC는 방향이 다르다.  
단순 송출보다 실시간 상호작용에 초점이 있다. 카메라 영상을 낮은 지연으로 보고, 필요하면 음성이나 제어 메시지도 같이 주고받을 수 있다.

## WebRTC가 항상 정답은 아니다

WebRTC는 지연 시간이 낮고 브라우저 지원이 좋다.  
하지만 구현 난이도는 RTSP나 RTMPS보다 높게 느껴질 수 있다.

서비스에서 직접 챙겨야 하는 것들이 많다.

1. signaling 서버
2. STUN/TURN 서버
3. ICE candidate 교환
4. 연결 실패와 재시도 처리
5. TURN 트래픽 비용
6. 브라우저별 media 정책

단순히 카메라 영상을 서버로 올리고 여러 명이 약간의 지연을 감수하면서 보기만 하면 된다면 RTMPS나 HLS 구조가 더 단순할 수 있다.  
반대로 지연 시간이 중요하고, 사용자와 카메라 또는 사용자끼리 실시간으로 상호작용해야 한다면 WebRTC가 더 잘 맞는다.

> WebRTC는 낮은 지연과 양방향 통신이 필요할 때 강하다.  
> 대신 연결 협상, NAT traversal, TURN 비용까지 같이 설계해야 한다.

## 마무리

WebRTC는 단순한 영상 스트리밍 프로토콜이라기보다, 실시간 연결을 만들기 위한 전체 기술 묶음에 가깝다.  
SDP offer/answer로 미디어 조건을 맞추고, ICE candidate로 연결 후보를 찾고, STUN/TURN으로 NAT 환경을 넘고, DTLS/SRTP로 암호화된 미디어를 주고받는다.

RTSP나 RTMPS는 주로 서버 중심의 스트리밍 구조라면, WebRTC는 연결 협상과 네트워크 경로 탐색이 핵심이다.  
그래서 WebRTC를 도입할 때는 "영상을 보내는 방법"만 보는 게 아니라, signaling, STUN, TURN, ICE, fallback 비용까지 같이 봐야 한다.

정리하면 핵심은 두 가지다.

1. WebRTC는 P2P 기반의 실시간 양방향 통신에 강하다.
2. 연결 실패를 디버깅하려면 핸드셰이크 과정과 STUN/TURN의 역할을 이해해야 한다.

## 참고 자료

- [W3C - WebRTC Recommendation](https://www.w3.org/TR/webrtc/)
- [MDN - WebRTC API](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)
- [WebRTC.org - Getting started with peer connections](https://webrtc.org/getting-started/peer-connections)
- [RFC 8445 - Interactive Connectivity Establishment (ICE)](https://www.rfc-editor.org/rfc/rfc8445)
- [RFC 8489 - Session Traversal Utilities for NAT (STUN)](https://www.rfc-editor.org/rfc/rfc8489)
- [RFC 8656 - Traversal Using Relays around NAT (TURN)](https://www.rfc-editor.org/rfc/rfc8656)
- [RFC 7826 - Real-Time Streaming Protocol Version 2.0](https://www.rfc-editor.org/rfc/rfc7826)
- [RTMP Specification 1.0](https://rtmp.veriskope.com/pdf/rtmp_specification_1.0.pdf)
