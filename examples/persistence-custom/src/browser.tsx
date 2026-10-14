import "@fontsource-variable/ibm-plex-sans/wght.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import { KeyValueStore } from "effect/persistence";

import { mountAccountApp } from "../../shared/account/browser";
import { minimumPasswordLength } from "../../shared/account/contract";
import { makeClient } from "./client";

const client = makeClient(
  { baseUrl: window.location.origin },
  KeyValueStore.layerStorage(() => window.sessionStorage),
);

mountAccountApp(client, {
  number: "04",
  description: "Custom services example",
  minimumPasswordLength,
  username: true,
});
