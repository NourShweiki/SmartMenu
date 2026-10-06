"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { ConfirmSubmit } from "@/interface/web/components/confirm-submit";
import type { PhotoFormState } from "./photo-actions";

type UploadAction = (state: PhotoFormState, form: FormData) => Promise<PhotoFormState>;
type RemoveAction = (state: PhotoFormState) => Promise<PhotoFormState>;

/** Photo section of the edit-item page: preview, upload / replace, remove. */
export function PhotoUploader({
  imageUrl,
  alt,
  upload,
  remove,
}: {
  imageUrl: string | null;
  alt: string;
  upload: UploadAction;
  remove: RemoveAction;
}) {
  const t = useTranslations("Photo");
  const [uploadState, uploadAction, uploading] = useActionState(upload, {});
  const [removeState, removeAction, removing] = useActionState(remove, {});
  const error = uploadState.error ?? removeState.error;
  // The browser's own file-picker text ("Choose File / No file chosen") can't be translated,
  // so the real input is visually hidden behind a translated label.
  const [chosen, setChosen] = useState<{ name: string; at?: number } | null>(null);
  const chosenName = chosen && chosen.at === uploadState.savedAt ? chosen.name : null;

  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-semibold">{t("title")}</h2>
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex size-32 items-center justify-center overflow-hidden rounded-xl bg-gray-100 text-center text-xs text-gray-500">
          {imageUrl ? (
            // Photos are already sized by the owner; Supabase serves them directly.
            <Image src={imageUrl} alt={alt} width={128} height={128} unoptimized className="size-32 object-cover" />
          ) : (
            <span className="px-2">{t("none")}</span>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {/* key: a fresh input after each successful upload clears the chosen file */}
          <form key={uploadState.savedAt ?? 0} action={uploadAction} className="flex flex-wrap items-center gap-2">
            <label className="cursor-pointer rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold hover:bg-gray-100 focus-within:ring-2 focus-within:ring-gray-900">
              {t("choose")}
              <input
                type="file"
                name="photo"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(e) => {
                  const f = e.currentTarget.files?.[0];
                  setChosen(f ? { name: f.name, at: uploadState.savedAt } : null);
                }}
              />
            </label>
            <span className="max-w-48 truncate text-sm text-gray-600" dir="auto">
              {chosenName ?? t("noneChosen")}
            </span>
            <button
              type="submit"
              disabled={uploading}
              className="rounded-lg bg-gray-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-gray-700 disabled:opacity-60"
            >
              {uploading ? t("uploading") : imageUrl ? t("replace") : t("upload")}
            </button>
          </form>
          <p className="text-xs text-gray-500">{t("hint")}</p>

          {imageUrl && (
            <form action={removeAction}>
              <ConfirmSubmit
                question={t("removeConfirm")}
                disabled={removing}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-60"
              >
                {t("remove")}
              </ConfirmSubmit>
            </form>
          )}

          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {t(`errors.${error}`)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
