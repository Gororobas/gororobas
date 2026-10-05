import type { CustomFetch } from "openid-client";

const maximumBodyBytes = 1024 * 1024;

/** Foreign Fetch boundary: retain both cancellation authorities through body reads.
 * Buffer only bounded responses, never follow redirects or retry a grant. */
export const boundedFetch =
  (fetch: CustomFetch, effectSignal: AbortSignal, allowedUrls: ReadonlySet<string>): CustomFetch =>
  async (url, options) => {
    if (!allowedUrls.has(url)) throw new Error("OAuth transport unavailable");

    const signal = AbortSignal.any([
      effectSignal,
      ...(options.signal === undefined ? [] : [options.signal]),
    ]);

    signal.throwIfAborted();
    const response = await fetch(url, { ...options, redirect: "manual", signal });

    signal.throwIfAborted();
    if (response.redirected || (response.status >= 300 && response.status < 400)) {
      await response.body?.cancel();
      throw new Error("OAuth transport unavailable");
    }
    if (response.body === null) return response;
    const reader = response.body.getReader();

    const cancel = () => {
      void reader.cancel().catch(() => undefined);
    };

    signal.addEventListener("abort", cancel, { once: true });
    const chunks: Uint8Array[] = [];
    let length = 0;

    try {
      while (true) {
        signal.throwIfAborted();
        const next = await reader.read();

        signal.throwIfAborted();
        if (next.done) break;
        length += next.value.byteLength;
        if (length > maximumBodyBytes) throw new Error("OAuth transport unavailable");
        chunks.push(next.value);
      }
      const bytes = new Uint8Array(length);
      let offset = 0;

      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }

      return new Response(bytes, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } catch (error) {
      cancel();
      throw error;
    } finally {
      signal.removeEventListener("abort", cancel);
      reader.releaseLock();
    }
  };
