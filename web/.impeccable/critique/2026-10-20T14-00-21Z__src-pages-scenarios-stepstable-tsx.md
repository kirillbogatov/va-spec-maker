---
target: Обработка ошибок tab (StepsTable.tsx)
total_score: 22
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:V:\\Claude\\VA Spec Maker\\web\\src\\pages\\scenarios\\StepsTable.tsx"
target_fingerprint: "sha256:0d068bc733d707f9d9fd26bd290023058cc9a0bc231d71c74cb151e77f07671f"
target_path: "V:\\Claude\\VA Spec Maker\\web\\src\\pages\\scenarios\\StepsTable.tsx"
timestamp: 2026-10-20T14-00-21Z
slug: src-pages-scenarios-stepstable-tsx
---
Method: dual-agent. Target: Обработка ошибок tab (StepsTable.tsx + ConditionsCell.tsx). Score 22/40 (Acceptable). Detector: 0 findings (tsx parsing unverified).
Specificity: interchangeable (~2/10); Google Workspace palette, stock shadcn, product vocabulary not expressed visually.
Priority issues:
- [P1] State identifier truncated (ASK_TE...); table-fixed/colgroup, min-w state column, mono token. -> layout, typeset
- [P1] Row density / cluttered conditions cell (~170px per rule); one + menu, hint in header, free text first, remove 70vh cap. -> distill, layout
- [P1] No orientation/help; triple headings; hide single PartTabs, description, empty state, tooltips. -> onboard, clarify
- [P2] Invisible affordances, inconsistent pickers/fields. -> polish
- [P2] A11y of error signals: hover-only icon, warning contrast 1.9:1, 32px icon buttons, 2D scroll. -> harden
Personas: Alex, Sam, Marina (analyst).
