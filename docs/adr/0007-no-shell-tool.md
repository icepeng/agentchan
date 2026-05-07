# Creative agent에는 shell Tool 대신 script Tool을 제공한다

Creative agent에는 Bash, sh, cmd, PowerShell 같은 일반 shell Tool을 제공하지 않는다. Skill이나 Project가 helper code 실행을 필요로 하면 `script` Tool로 Project folder 안의 TypeScript/JavaScript 파일을 실행한다.

`script` Tool은 `process.execPath run <script>`를 `BUN_BE_BUN=1` 환경 변수와 함께 실행한다. 개발 환경에서는 사용자 `bun` binary가 실행되고, `bun --compile`로 만든 packaged executable에서는 실행 파일 자체가 Bun CLI로 동작한다. 따라서 User가 별도 Bun 설치나 shell 환경을 갖추지 않아도 Template/Skill이 제공한 helper script를 실행할 수 있다.

Motivation: Agentchan은 **Desktop app**으로 배포된다. 일반 shell Tool은 OS별 shell 차이와 설치 상태를 Creative agent 실행 계약에 끌어들이고, Windows User나 Desktop app에서 Template helper script 실행을 불안정하게 만든다.

## Consequences

- Template/Skill helper script는 TypeScript 또는 JavaScript로 작성한다.
- Shell pipeline, shell builtin, OS별 command 조합은 Creative agent Tool 계약에 포함하지 않는다.
