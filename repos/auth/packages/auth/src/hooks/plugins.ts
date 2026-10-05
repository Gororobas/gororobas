import type { RpcGroup } from "effect/rpc";

import { type AnyOperation, operationGroup } from "../operations/operation";
import { type AnyHookContribution, composeHooks } from "./LifecycleHooks";
import { HookConfigurationError } from "./models";

/** Host-owned route implementation; metadata only reserves the method/path pair. */
export interface RouteContribution {
  readonly id: string;
  readonly method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS" | "HEAD";
  readonly path: string;
}

export interface PluginContributions {
  readonly id: string;
  readonly operations: ReadonlyArray<AnyOperation>;
  readonly hooks: ReadonlyArray<AnyHookContribution>;
  readonly routes: ReadonlyArray<RouteContribution>;
}

/** Optional aggregation metadata alongside ordinary exported implementation Layers. */
export const pluginContributions = <const Contributions extends PluginContributions>(
  contributions: Contributions,
) =>
  Object.freeze({
    id: contributions.id,
    operations: Object.freeze([...contributions.operations]) as Contributions["operations"],
    hooks: Object.freeze([...contributions.hooks]) as Contributions["hooks"],
    routes: Object.freeze(
      contributions.routes.map((route) => Object.freeze({ ...route })),
    ) as Contributions["routes"],
  });

export const composePlugins = <const Plugins extends ReadonlyArray<PluginContributions>>(
  ...plugins: Plugins
) => {
  const snapshots = plugins.map((plugin) => ({
    id: plugin.id,
    operations: [...plugin.operations],
    hooks: plugin.hooks.map(({ id, resolve }) => Object.freeze({ id, resolve })),
    routes: plugin.routes.map((route) => Object.freeze({ ...route })),
  }));

  const ids = new Set<string>();
  const hookIds = new Set<string>();
  const routeIds = new Set<string>();
  const routeKeys = new Set<string>();

  for (const plugin of snapshots) {
    if (ids.has(plugin.id))
      throw HookConfigurationError.make({
        reason: "duplicate-contribution",
        contribution: plugin.id,
      });
    ids.add(plugin.id);
    for (const hook of plugin.hooks) {
      if (hookIds.has(hook.id))
        throw HookConfigurationError.make({
          reason: "duplicate-contribution",
          contribution: hook.id,
        });
      hookIds.add(hook.id);
    }
    for (const route of plugin.routes) {
      const key = `${route.method} ${route.path}`;

      if (routeIds.has(route.id) || routeKeys.has(key))
        throw HookConfigurationError.make({ reason: "duplicate-route", contribution: route.id });
      routeIds.add(route.id);
      routeKeys.add(key);
    }
  }
  const operations = snapshots.flatMap((plugin) => plugin.operations);

  const hooks = snapshots.flatMap((plugin) => plugin.hooks) as Array<
    Plugins[number]["hooks"][number]
  >;

  return Object.freeze({
    // Array flattening erases tuple membership; every RPC comes from these validated contributions.
    operations: operationGroup(...operations) as RpcGroup.RpcGroup<
      Plugins[number]["operations"][number]["rpc"]
    >,
    hooks: composeHooks<Plugins[number]["hooks"][number]["id"]>(...hooks),
    routes: Object.freeze(snapshots.flatMap((plugin) => plugin.routes)),
  });
};
