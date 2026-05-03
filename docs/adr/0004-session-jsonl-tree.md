# 세션은 Pi-compatible SessionEntry JSONL로 저장한다

Session storage는 자체 `_header`/`_marker`/`TreeNode` 포맷이 아니라 Pi v3 compatible `SessionEntry` JSONL을 사용하며, 첫 줄 header에 Agentchan 확장 `mode?: "creative" | "meta"`를 둔다. Branch selection은 파일에 pointer로 저장하지 않고 `leafId`의 `parentId` chain에서 derive하며, compaction도 같은 entry graph 안의 `CompactionEntry`로 남겨 session list, title, usage 계산을 단일 파일 스캔으로 닫는다.
