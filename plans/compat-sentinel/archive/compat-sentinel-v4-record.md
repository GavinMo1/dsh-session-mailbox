# compat-sentinel v4 — Review Record（过渡版本，已并入 v5）

被评审版本：`compat-sentinel-v4.md`。读者：Author 与 User。

## 结论

**v4 没有单独完成一个 round。** round 3 的两份报告没有同时到达：reused route（r2-goal）先回，我据它改了 `region` 取窗规则并出了 v4；随后新 scan route（r3-adv）的报告到达，其中 R3A-01/R3A-02 正好指向我刚写进 v4 的那条规则（止锚取「起锚之后第一个匹配」），v4 因此立即作废。两份报告的全部条目由 **v5** 承接。

- v4 → v5 是 Substantive Change（判定顺序、`missing` 打印规则、总评分支阈值、`liveOrThrow` 的一段、验收表三行的期望值）。
- v4 的全文在 `archive/compat-sentinel-v4.md`。v4 没有独立的 route 复核，**不计入 round 数**；round 数按「v3 的文本被 round 3 的两份报告评过」算 1 次。
- 教训（写进 v5 记录）：同一 round 的多个 route 结果应当**等齐**再动手改文本。本轮我先用其中一份就开了新版本，等于把一个未经复核的中间态当成了交付物。
