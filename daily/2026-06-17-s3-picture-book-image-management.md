# S3 이미지 관리 (캐싱, 버전관리)

그림책 이미지를 S3에 올려서 관리하는 작업을 했다.  
작업 자체는 단순히 이미지를 업로드하고 URL을 내려주는 것처럼 보였는데, 실제로는 이미지 개수, 앱 캐싱, 이미지 변경 시점, 관리자 페이지 UX까지 같이 고민해야 했다.

특히 그림책은 한 권 안에 여러 장의 이미지가 들어간다.  
그래서 처음에는 "이미지를 하나씩 올릴 것인가", 아니면 "그림책 한 권에 해당하는 이미지들을 압축해서 한 번에 올릴 것인가"부터 고민하게 됐다.

> 이번 작업의 핵심은 S3에 이미지를 올리는 것 자체보다, 이미지가 바뀌었을 때 앱이 어떻게 새 이미지를 자연스럽게 받게 할 것인가였다.

## 1. 처음 아이디어는 압축 파일로 관리하는 방식이었다

처음 나온 아이디어는 그림책 한 권에 들어가는 이미지들을 하나의 압축 파일로 묶어서 S3에 올리는 방식이었다.  
예를 들어 `book-001.zip` 안에 `1.png`, `2.png`, `3.png` 같은 이미지들을 넣어두고, 앱에서는 이 zip 파일을 내려받아 풀어서 사용하는 구조다.

이 방식의 장점은 분명했다.  
앱 입장에서는 S3 접근 요청을 여러 번 하지 않아도 되고, 한 권에 필요한 리소스를 한 번에 받을 수 있다. 네트워크 요청 수만 보면 꽤 깔끔해 보였다.

하지만 단점도 바로 보였다.

1. 앱에서 압축 파일을 풀어야 한다.
2. 압축을 푼 이미지들을 다시 앱 내부에서 캐싱해야 한다.
3. 이미지 한 장만 바뀌어도 압축 파일 전체를 다시 내려받아야 한다.
4. 다운로드 실패나 압축 해제 실패 같은 예외 처리가 추가된다.

특히 세 번째 문제가 컸다.  
그림책 이미지 중 한 장만 수정돼도 결국 전체 zip 파일을 다시 다운로드해야 한다. 이미지가 많아질수록 변경 단위가 너무 커지는 구조였다.

> 압축 방식은 요청 수는 줄일 수 있지만, 변경 단위가 너무 커지고 앱에서 처리해야 할 일이 많아졌다.

## 2. 그래서 이미지를 하나씩 올리는 방식도 고민했다

다른 아이디어는 이미지를 하나씩 S3에 올리는 방식이었다.  
예를 들어 아래처럼 각 페이지 이미지를 별도 object로 관리하는 구조다.

```text
books/001/images/001.png
books/001/images/002.png
books/001/images/003.png
```

이 방식은 이미지 한 장만 바뀌었을 때 해당 이미지만 교체하면 된다.  
관리 단위가 작아지고, 관리자 페이지에서도 페이지별로 이미지를 바꾸는 시나리오를 만들기 쉽다.

대신 고민도 있었다.

1. 이미지가 여러 장이면 S3 접근 요청이 많아질 수 있다.
2. 앱에서 이미지 캐싱을 어떻게 관리할지 결정해야 한다.
3. 이미지 순서가 바뀌거나 특정 이미지만 교체될 때 앱이 새 이미지를 잘 받아야 한다.

처음에는 S3 요청이 많아지는 게 걱정됐다.  
하지만 앱 개발자들과 이야기해보니, 앱 내부 로컬 DB에 이미지별 상태를 따로 저장하고 관리하는 방식은 최대한 피하고 싶다는 의견이 있었다. 앱 쪽에서 별도 캐시/DB 관리를 많이 하게 되면 구현도 복잡해지고, 나중에 이미지 변경 정책이 바뀔 때 수정 범위가 커질 수 있기 때문이다.

결국 서버 API 응답으로 내려주는 이미지 식별 값이 바뀌면 앱은 새 이미지라고 인식하고 다시 다운로드하는 구조가 가장 단순해 보였다.

> 앱에 별도 이미지 버전 상태를 들고 있게 하기보다, 서버 응답으로 내려주는 URL에서 presigned URL 서명 값은 제외하고 이미지 경로와 버전 값을 캐시 기준으로 쓰는 방향이 더 단순했다.

## 3. 문제는 S3 URL과 캐싱이었다

S3 이미지는 presigned URL 형태로 내려주고 있었다.  
presigned URL은 private object를 일정 시간 동안만 접근할 수 있게 해주는 URL이다. S3 object 자체를 public으로 열어두지 않아도 되고, URL에 만료 시간을 부여할 수 있어서 접근 제어 측면에서 좋다.

대략 이런 형태다.

```text
https://bucket.s3.amazonaws.com/books/001/images/001.png
  ?X-Amz-Algorithm=...
  &X-Amz-Credential=...
  &X-Amz-Expires=...
  &X-Amz-Signature=...
```

여기서 고민은 이미지가 변경됐을 때였다.  
presigned URL은 만료 시간이나 서명 값 때문에 매번 달라질 수 있다. 이 값을 그대로 캐시 키로 쓰면 실제 이미지는 그대로인데도 URL이 바뀔 때마다 새 이미지처럼 처리될 수 있다.

그래서 앱에서는 presigned URL의 서명 파라미터는 빼고 캐싱하는 방향을 잡았다.  
다만 S3 object key가 같고 앱이 보는 이미지 식별 값도 같으면, 이미지가 교체됐을 때도 기존에 캐싱한 이미지라고 판단할 수 있다. 결국 서버가 내려주는 값 안에 "이미지가 바뀌었다"는 신호를 같이 넣어줘야 했다.

처음 떠올린 방법은 세 가지였다.

1. 파일명을 바꾼다. 예를 들어 `001.png` 대신 `001-v3.png`로 저장한다.
2. query string에 버전을 붙인다. 예를 들어 `001.png?version=3`처럼 만든다.
3. URL fragment를 붙인다. 예를 들어 `001.png#version=3`처럼 만든다.

각 방식마다 장단점이 있었다.

## 4. S3 Versioning을 쓰지 않은 이유

S3에는 Versioning 기능이 있다.  
S3 Versioning을 켜면 같은 key에 파일을 다시 업로드해도 S3가 내부적으로 `versionId`를 부여해서 여러 버전을 관리할 수 있다. 실수로 덮어쓴 파일을 복구하거나, 이전 버전을 보관해야 하는 요구사항에는 좋은 기능이다.

하지만 이번 요구사항에는 딱 맞지 않았다.  
우리 쪽에서는 이미지가 변경되면 이전 이미지를 계속 보관하거나 복구하는 것보다, 이전 이미지는 필요 없어지고 새 이미지만 보여주면 되는 구조에 가까웠다.

즉 S3가 모든 버전을 계속 들고 있게 하기보다, 서비스 DB에서 현재 이미지 버전과 순서를 통제하는 편이 요구사항에 더 맞았다.

> S3 Versioning은 이전 파일까지 보존해야 할 때 강점이 있다.  
> 이번 작업에서는 이전 이미지를 관리하는 것보다, 현재 앱에 어떤 이미지를 보여줄지를 서비스 DB에서 통제하는 게 더 중요했다.

## 5. fragment를 버전처럼 붙이는 아이디어

고민 끝에 떠올린 방식이 URL fragment를 사용하는 것이었다.  
서버에서 앱으로 내려주는 API 응답의 이미지 URL 뒤에 `#version=3` 같은 값을 붙이면, 앱 입장에서는 presigned URL의 서명 값은 제외하면서도 이미지 버전은 캐시 기준에 포함할 수 있다.  
여기서 `3`이라는 값은 S3가 관리하는 값이 아니라 서비스 DB에서 관리하는 이미지 버전 값이다.

```text
https://bucket.s3.amazonaws.com/books/001/images/001.png?...signature...
#version=3
```

이 방식의 장점은 presigned URL의 query string을 건드리지 않아도 된다는 점이다.  
presigned URL은 query string까지 포함해서 서명 검증이 걸려 있기 때문에, 서명 이후에 임의로 query parameter를 추가하면 문제가 될 수 있다. 반면 fragment는 HTTP 요청으로 서버에 전달되지 않으므로 S3 서명 검증에는 영향을 주지 않는다.

그래서 서버에서는 서비스 DB에 저장된 이미지 버전 값을 보고 presigned URL을 만든 뒤, API 응답에 내려줄 때만 fragment를 붙인다.

```python
def build_picture_image_url(presigned_url: str, image_version: int) -> str:
    return f"{presigned_url}#version={image_version}"
```

앱이 실제로 받는 응답은 대략 이런 형태가 된다.

```json
{
  "bookId": 1,
  "images": [
    {
      "order": 1,
      "url": "https://bucket.s3.amazonaws.com/books/001/images/001.png?...signature...#version=3"
    }
  ]
}
```

다만 이 방식에는 중요한 전제가 있다.  
fragment는 HTTP 요청에는 전달되지 않는다. 즉 S3나 CDN 입장에서는 `#version=3` 값을 알 수 없다. 이 방식은 서버 리소스 버전 변경용이라기보다, 앱이 캐시 키를 만들 때 presigned URL 서명 파라미터는 제외하고 object path와 fragment 버전을 함께 보는 구조에서 효과가 있는 방식이다.

> `#version=3`은 S3에 전달되는 값이 아니다.  
> 앱 캐시 키에 포함시키는 용도로는 사용할 수 있지만, HTTP 캐시나 S3 object 자체의 버전 관리 수단으로 보면 안 된다.

이 부분은 꽤 중요했다.  
만약 앱 이미지 라이브러리가 fragment를 제외한 URL만 캐시 키로 사용한다면 이 방식은 기대한 대로 동작하지 않을 수 있다. 그래서 앱에서는 presigned URL의 서명 파라미터는 제외하되, `#version=3` 값은 캐시 키에 포함되도록 맞춰야 했다.

이번에는 앱에서 presigned URL 서명 값은 캐시 기준에서 제외하고, 서비스 DB의 이미지 버전 값을 서버 응답 URL의 `#version=3` fragment로 내려받아 새 이미지 여부를 판단하는 방식으로 구현했다.

## 6. 서비스 DB에서 통제한 부분

S3에 이미지를 올리는 것만으로는 충분하지 않았다.  
어떤 그림책의 몇 번째 이미지인지, 현재 노출해야 하는 이미지 버전이 무엇인지, 관리자가 이미지를 교체했을 때 어떤 URL을 내려줘야 하는지를 서비스 DB에서 관리해야 했다.

대략 이런 식의 데이터를 생각했다.

```text
picture_book_id
image_order
s3_object_key
image_version
updated_at
```

이미지가 변경되면 S3 object를 교체하고, DB의 `image_version` 값을 올린다.  
그리고 앱에 응답을 내려줄 때는 서버가 presigned URL 뒤에 `#version={image_version}`을 붙여서 내려준다.

```python
def get_picture_book_images(book_id: int) -> list[str]:
    images = image_repository.find_by_book_id(book_id)
    result = []

    for image in images:
        presigned_url = s3_client.generate_presigned_url(image.s3_object_key)
        result.append(build_picture_image_url(presigned_url, image.image_version))

    return result
```

이렇게 하면 앱은 별도 로컬 DB에 이미지 버전 상태를 들고 있지 않아도 된다.  
앱은 서버 응답에 포함된 URL에서 presigned URL 서명 파라미터는 캐시 기준에서 제외하고, object path와 fragment 버전을 기준으로 이미지를 캐싱하면 된다. 이미지가 바뀌면 서비스 DB의 `image_version`이 올라가고, 응답 URL의 `#version`도 같이 바뀌기 때문에 앱은 새 이미지로 판단할 수 있다.

## 7. 관리자 페이지에서 휴먼 에러를 줄이는 쪽도 중요했다

이미지 관리 방식이 정해졌다고 끝은 아니었다.  
실제로 운영에서 이미지를 올리고 순서를 바꾸는 사람은 관리자 페이지를 사용한다. 여기서 실수하기 쉬운 구조라면 S3 설계를 잘해도 문제가 생길 수 있다.

그래서 관리자 페이지에서는 이미지 순서와 교체를 최대한 명확하게 처리할 수 있는 시나리오가 필요했다.

1. 그림책별 이미지 목록을 순서대로 보여준다.
2. 특정 순서의 이미지만 교체할 수 있게 한다.
3. 이미지를 교체하면 서버에서 `image_version`을 자동으로 올린다.
4. 관리자가 직접 URL이나 버전 값을 수정하지 않아도 되게 한다.
5. 저장 후 앱에서 내려받는 이미지 URL이 바뀌었는지 확인할 수 있게 한다.

이렇게 하면 관리자가 파일명을 직접 바꾸거나 버전 값을 수동으로 맞출 필요가 줄어든다.  
결국 휴먼 에러를 줄이는 것도 기능 설계의 일부였다.

## 마무리

이번 작업을 하면서 느낀 건, S3의 좋은 기능을 그대로 쓰는 것도 중요하지만 요구사항에 맞게 어디까지 쓸지 결정하는 게 더 중요하다는 점이었다.  
S3 Versioning은 분명 좋은 기능이지만, 이번 요구사항에서는 이전 버전을 보관하는 것보다 현재 이미지 버전을 애플리케이션에서 통제하는 게 더 맞았다.

압축 파일로 묶는 방식도 처음에는 좋아 보였지만, 앱에서 압축을 풀고 캐싱까지 관리해야 해서 변경 단위가 너무 커졌다.  
이미지를 하나씩 관리하는 방식은 요청 수가 늘 수 있지만, 이미지 교체와 관리자 페이지 운영까지 생각하면 더 현실적인 선택이었다.

정리하면 이번 판단 기준은 이거였다.

> 좋은 기능을 많이 쓰는 것보다, 현재 요구사항에 맞는 정도로 단순하게 쓰는 게 더 중요했다.  
> 이번에는 S3가 파일을 안전하게 보관하고 presigned URL로 접근을 제어하게 두고, 이미지 버전과 노출 정책은 서비스 DB에서 관리하는 쪽이 더 맞았다.

## 참고 자료

- [AWS S3 - Sharing objects with presigned URLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/ShareObjectPreSignedURL.html)
- [AWS S3 - Download and upload objects with presigned URLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html)
- [AWS S3 - How S3 Versioning works](https://docs.aws.amazon.com/AmazonS3/latest/userguide/versioning-workflows.html)
- [AWS S3 - Naming Amazon S3 objects](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-keys.html)
- [MDN - URL hash property](https://developer.mozilla.org/en-US/docs/Web/API/URL/hash)
