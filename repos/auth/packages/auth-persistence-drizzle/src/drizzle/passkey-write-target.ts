import { passkeyKernel } from "./passkey-kernel";

export const {
  passkeyManagementPersistenceLayer,
  makeTargetPasskeyManagement,
  makeTargetPasskeyRegistrationWriter,
  coordinateTargetPasskeyManagement,
  coordinateTargetPasskeyRegistrationWriter,
} = passkeyKernel.writeTarget;
