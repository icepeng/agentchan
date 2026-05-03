# files/는 시스템이 해석하지 않는 사용자 콘텐츠 workspace다

`files/` 안의 항목은 모두 사용자 콘텐츠로 취급하고, 시스템은 recursive scan으로 `ProjectFile[]` snapshot만 만든다.
Markdown frontmatter와 YAML/JSON parse 결과는 노출하지만 도메인 의미는 renderer, skill, template이 해석하게 두어 장르별 schema가 core에 고정되지 않게 한다.
