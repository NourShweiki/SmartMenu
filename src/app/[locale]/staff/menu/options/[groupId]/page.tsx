import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ConfirmSubmit } from "@/interface/web/components/confirm-submit";
import { MoveButtons } from "@/interface/web/components/move-buttons";
import { initLocale } from "@/interface/web/i18n/init-locale";
import { filsToPriceInput } from "@/interface/web/price-input";
import { ItemFormShell } from "@/interface/web/staff/item-form-page";
import {
  deleteGroupAction,
  deleteOptionAction,
  moveOptionAction,
  saveGroupAction,
  saveOptionAction,
} from "@/interface/web/staff/option-actions";
import { OptionGroupForm, OptionRowForm } from "@/interface/web/staff/option-forms";
import { loadOptionsForEditing } from "@/interface/web/staff/options-page";

export default async function EditOptionGroupPage({
  params,
}: {
  params: Promise<{ locale: string; groupId: string }>;
}) {
  const locale = await initLocale(params);
  const { groupId } = await params;
  const { restaurant, groups } = await loadOptionsForEditing(locale);
  const t = await getTranslations("Options");

  // Only this restaurant's live groups are loaded, so anything else 404s.
  const view = groups.find((g) => g.group.id === groupId);
  if (!view) notFound();
  const { group, options, itemIds } = view;
  const nextSort = Math.max(-1, ...options.map((o) => o.sortOrder)) + 1;

  return (
    <ItemFormShell locale={locale} restaurant={restaurant} title={t("editGroup")}>
      <OptionGroupForm
        action={saveGroupAction.bind(null, locale, { kind: "edit", groupId: group.id, sortOrder: group.sortOrder })}
        initial={{
          nameAr: group.name.ar,
          nameEn: group.name.en,
          minSelect: String(group.minSelect),
          maxSelect: String(group.maxSelect),
        }}
        cancelHref={`/${locale}/staff/menu/options`}
      />

      <hr className="my-6 border-gray-100" />
      <section className="flex flex-col gap-4">
        <div>
          <h2 className="font-semibold">{t("optionsTitle")}</h2>
          <p className="text-sm text-gray-500">{t("optionsHint")}</p>
        </div>
        {options.length === 0 && <p className="text-sm text-amber-700">{t("noOptionsYet")}</p>}
        {options.map((o, index) => (
          <div key={o.id} className="flex items-start gap-2">
            <MoveButtons
              up={moveOptionAction.bind(null, locale, o.id, "up")}
              down={moveOptionAction.bind(null, locale, o.id, "down")}
              isFirst={index === 0}
              isLast={index === options.length - 1}
              upLabel={t("moveUp")}
              downLabel={t("moveDown")}
            />
            <div className="min-w-0 flex-1">
              <OptionRowForm
                action={saveOptionAction.bind(null, locale, { kind: "edit", optionId: o.id, sortOrder: o.sortOrder })}
                initial={{
                  nameAr: o.name.ar,
                  nameEn: o.name.en,
                  price: o.priceDeltaFils ? filsToPriceInput(o.priceDeltaFils) : "",
                }}
                submitLabel={t("save")}
                remove={{
                  action: deleteOptionAction.bind(null, locale, o.id),
                  question: t("deleteOptionConfirm"),
                  label: t("deleteOption"),
                }}
              />
            </div>
          </div>
        ))}
        <div className="rounded-xl bg-gray-50 p-3">
          <p className="mb-2 text-sm font-semibold">{t("addOption")}</p>
          <OptionRowForm
            action={saveOptionAction.bind(null, locale, { kind: "new", groupId: group.id, sortOrder: nextSort })}
            initial={{ nameAr: "", nameEn: "", price: "" }}
            submitLabel={t("add")}
          />
        </div>
      </section>

      <hr className="my-6 border-gray-100" />
      <form action={deleteGroupAction.bind(null, locale, group.id)} className="flex flex-col gap-2">
        <h2 className="font-semibold text-red-700">{t("deleteGroup")}</h2>
        <p className="text-sm text-gray-600">{t("deleteGroupHint", { count: itemIds.length })}</p>
        <div>
          <ConfirmSubmit
            question={t("deleteGroupConfirm")}
            className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
          >
            {t("deleteGroup")}
          </ConfirmSubmit>
        </div>
      </form>
    </ItemFormShell>
  );
}
