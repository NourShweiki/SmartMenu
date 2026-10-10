import type { MenuError } from "@/domain/menu/menu";
import type { OptionError } from "@/domain/menu/options";
import type { PhotoError } from "@/domain/menu/photo";
import type { ForbiddenError, StaffActor } from "../permissions";

export { requirePermission } from "../permissions";

/** The signed-in staff member acting on the menu. */
export type MenuActor = StaffActor;

export type MenuUseCaseError =
  | MenuError
  | OptionError
  | PhotoError
  | ForbiddenError
  | { type: "ITEM_NOT_FOUND" }
  | { type: "OPTION_NOT_FOUND" };
