# Third-party notices

`@yielded/crypto` uses native runtime capabilities and owned portable implementations
adapted from the sources below. Effect is its only runtime package dependency.
The Effect services, validation, admission, scheduling and backend integration are
Yielded code; the portable arithmetic retains its upstream attribution.

## Noble hashes and ciphers — MIT

Paul Miller and contributors, [noble-hashes](https://github.com/paulmillr/noble-hashes)
and [noble-ciphers](https://github.com/paulmillr/noble-ciphers).

- noble-hashes 2.3.0, revision `8060cc83bbab6681d23c9eed071db3f3a6b442da`:
  `test/hmac.test.ts`, `test/kdf.test.ts`, `test/argon2.test.ts` influenced and
  supplied selected known-answer/validation tests in `test/primitives.test.ts`,
  `test/boundaries.test.ts`, and `test/vectors.ts`. All nine Argon2id v19 known
  answers from `test/argon2.test.ts` are adapted in `test/argon2.test.ts` and
  `test/fixtures/argon2-vectors.ts`; Argon2d, Argon2i and version 16 are excluded
  because they are outside the supported API.
  `src/argon2.ts`, `src/blake2.ts`, `src/_blake.ts`, and `src/_u64.ts` are adapted
  into `src/internal/argon2-core.ts`, `blake2b.ts`, and `word64.ts`. The port retains
  Argon2id v19 and its unkeyed BLAKE2b machinery, with per-derivation work buffers,
  explicit little-endian encoding, and an Effect driver in `src/internal/argon2.ts`.
  `src/internal/argon2-block.c` expresses the same block compression with Wasm SIMD;
  `src/internal/argon2.wasm` is its compiled artifact. The workerd backend shares
  the portable initialization, indexing, finalization and Effect scheduling.
- noble-ciphers 2.1.1, revision `785181b0772ba84afbe812025714163e4e48262f`:
  AEAD test behavior and independent vectors informed `test/primitives.test.ts`
  and `test/vectors.ts`. `src/chacha.ts`, `src/_poly1305.ts`, and the stream/nonce
  construction in `src/_arx.ts` are adapted into `src/internal/xchacha-core.ts`
  and `poly1305.ts`. Only XChaCha20-Poly1305 is retained. The port uses owned work
  buffers, authenticates before producing plaintext, and returns typed Effect
  failures through `src/internal/xchacha.ts`.

The MIT notices below preserve both libraries' copyright holders. Noble's
cipher license also credits Thomas Pornin.
Noble's Poly1305 arithmetic derives from Andrew Moon's public-domain
[poly1305-donna](https://github.com/floodyberry/poly1305-donna/blob/e6ad6e091d30d7f4ec2d4f978be1fcfcbce72781/poly1305-donna-16.h).

## Project Wycheproof — Apache-2.0

Copyright 2016–2026 The Wycheproof Authors.
[Source revision](https://github.com/C2SP/wycheproof/tree/3fa63dd0344abb611f1fb1d77e119938603ea230).

`test/vectors.ts` contains selected, reformatted test data, with unused metadata
removed, from `testvectors_v1/aes_gcm_test.json` (tcId 91),
`ecdsa_secp256r1_sha256_p1363_test.json` (tcIds 64 and 11),
`rsa_pss_2048_sha256_mgf1_32_test.json` (tcId 1),
`rsa_pss_2048_sha256_mgf1_0_test.json` (tcId 1, valid generally but rejected by our
32-byte-salt profile), and `rsa_signature_2048_sha256_test.json` (tcIds 1 and 240).
These are test-data adaptations, not copied implementation. The Apache license
is reproduced below.

`test/fixtures/xchacha-vectors.ts` reformats all 315 cases from
`testvectors_v1/xchacha20_poly1305_test.json` at the same revision, retaining test
IDs, comments, flags and results. `test/xchacha.test.ts` adapts encryption,
decryption and rejection behavior through the public Effect service.

## Standards and independent results

Selected numerical vectors are reproduced in `test/vectors.ts` and exercised
through Effect services in `test/primitives.test.ts` and `test/signatures.test.ts`:

- RFC 2202 §3 (P. Cheng, R. Glenn), HMAC-SHA-1.
- RFC 4231 §4.2 (M. Nystrom), HMAC-SHA-256/384/512.
- RFC 5869 Appendix A.1 (H. Krawczyk, P. Eronen), HKDF-SHA-256.
- RFC 7914 §11 (C. Percival, S. Josefsson), PBKDF2-HMAC-SHA-256.
- RFC 9106 §5.3 (A. Biryukov, D. Dinu, D. Khovratovich, S. Josefsson),
  Argon2id v19. Also cross-referenced by Noble to the Argon2 reference vector at
  `P-H-C/phc-winner-argon2` revision `f57e61e19229e23c4445b85494dbf7c07de721cb`.
  No reference implementation code is copied. The reference project credits
  Daniel Dinu, Dmitry Khovratovich, Jean-Philippe Aumasson and Samuel Neves (2015),
  and offers CC0-1.0 or Apache-2.0; the selected vector is used under Apache-2.0.
- RFC 8032 §7.1, test 1 (S. Josefsson, I. Liusvaara), Ed25519.
- `draft-irtf-cfrg-xchacha-03`, Appendix A.3.1 (S. Arciszewski),
  XChaCha20-Poly1305. This is an Internet-Draft vector, not a claim of RFC status.

RFC 2202: Copyright (C) The Internet Society (1997). All Rights Reserved.
RFC 4231: Copyright (C) The Internet Society (2005).
RFC 5869/7914/8032/9106 and the XChaCha draft: Copyright (c) 2010/2016/2017/2021/2020
IETF Trust and the persons identified as the document authors. All rights reserved.
The extracted numerical vectors are reformatted as TypeScript data; no RFC prose
or implementation pseudocode is copied. IETF Code Component terms are retained below.

A binary-password PBKDF2 fixture is independently calculated using Python's
`hashlib.pbkdf2_hmac`; no Python source is copied. Source URLs are retained beside
each vector. Additional binary-input, rounded-memory and variable-output Argon2id
fixtures in `test/fixtures/argon2-vectors.ts` were independently calculated with
Node's native `crypto.argon2Sync` before the portable implementation was adapted.
These attributions do not imply an upstream endorsement or transfer an upstream
security audit to the adapted implementation.

## License texts

### noble-hashes

```text
The MIT License (MIT)

Copyright (c) 2022 Paul Miller (https://paulmillr.com)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the “Software”), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

### noble-ciphers

```text
The MIT License (MIT)

Copyright (c) 2022 Paul Miller (https://paulmillr.com)
Copyright (c) 2016 Thomas Pornin <pornin@bolet.org>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the “Software”), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

### Apache License 2.0

```text

                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS

   APPENDIX: How to apply the Apache License to your work.

      To apply the Apache License to your work, attach the following
      boilerplate notice, with the fields enclosed by brackets "[]"
      replaced with your own identifying information. (Don't include
      the brackets!)  The text should be enclosed in the appropriate
      comment syntax for the file format. We also recommend that a
      file or class name and description of purpose be included on the
      same "printed page" as the copyright notice for easier
      identification within third-party archives.

   Copyright [yyyy] [name of copyright owner]

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
```

### IETF Code Components — Simplified BSD

```text
Copyright (c) IETF Trust and the persons identified as authors of the
referenced documents. All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice,
   this list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE
LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
POSSIBILITY OF SUCH DAMAGE.
```
