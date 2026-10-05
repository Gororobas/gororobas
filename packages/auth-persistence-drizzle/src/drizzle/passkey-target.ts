import { passkeyKernel } from "./passkey-kernel";

export type {
  PasskeyTargetConfiguration,
  PasskeyCoordinatorError,
  PasskeyExecution,
} from "@yielded/auth-persistence/Adapter";

export const {
  sqlClientPasskeyStandaloneGuard,
  makePasskeyExecution,
  capturedService,
  prepareValue,
  observationalContext,
  makePasskeyPersistence,
  capturedMapping,
  makeTargetPasskeyCredentials,
  makeTargetPasskeyEnrollmentContext,
  makeTargetPasskeyPersistence,
  makeTargetPasskeyRegistration,
  coordinateTargetPasskey,
  coordinateTargetPasskeyRegistration,
} = passkeyKernel.target;
