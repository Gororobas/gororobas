---
"@yielded/auth": patch
"@yielded/auth-persistence": patch
"@yielded/auth-persistence-drizzle": patch
---

Complete email, password recovery, and phone flows with the original proof reference and secret; reissue through the request operation after cooldown, with fresh per-code guess counts and one local delivery. BEHAVIOR CHANGE: configure shared token-bucket stores across replicas and reset the replaced development proof, command, registration-receipt, and phone identifier storage; retired phone numbers remain occupied. Call `SmsProofDelivery.layer(send)` without a vendor policy (`ProofVendorPolicy` and `ProofDeliveryStatus` are removed), drop `requestId`, `fingerprint`, `replayLifetimeMillis` and `cleanup` from custom `PhoneAdmission` services, and remove the `sendCount` column from proof mappings.
