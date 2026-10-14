---
"@yielded/auth-persistence": patch
---

Keep composed persistence unavailable after interrupted initialization until its Layer is reacquired. Preserve shared setup while another caller is still waiting.
