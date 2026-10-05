import { defaultLayer } from "../auth/defaults";
import { NewPasswordCheck } from "./NewPasswordCheck";

export const newPasswordLayer = defaultLayer(NewPasswordCheck, NewPasswordCheck.layer());
