import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { localized } from "@/domain/shared/localized";
import { LanguageSwitch } from "@/interface/web/components/language-switch";
import { initLocale } from "@/interface/web/i18n/init-locale";
import { signOutAction } from "@/interface/web/staff/actions";
import { changePasswordAction } from "@/interface/web/staff/password-actions";
import { PasswordForm } from "@/interface/web/staff/password-form";
import { requireStaff } from "@/interface/web/staff/require-staff";

// Every member of staff can change their own password here. Somebody who still has the temporary password they were
// handed is sent here from every other staff page, and gets no way on until they have chosen their own.
export default async function PasswordPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await initLocale(params);
  const { restaurant, staff } = await requireStaff(locale, { allowTemporaryPassword: true });
  const t = await getTranslations("Password");
  const tHome = await getTranslations("StaffHome");

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-8">
        <header className="flex items-start justify-between gap-4">
          <div>
            {!staff.mustChangePassword && (
              <Link href={`/${locale}/staff`} className="text-sm text-gray-500 hover:text-gray-900">
                <span aria-hidden className="inline-block rtl:-scale-x-100">←</span> {t("backToDashboard")}
              </Link>
            )}
            <h1 className="mt-1 text-2xl font-semibold">{t("title")}</h1>
            <p className="text-sm text-gray-500">{localized(restaurant.name, locale)}</p>
          </div>
          <LanguageSwitch locale={locale} path="/staff/password" />
        </header>

        {staff.mustChangePassword && (
          <p role="note" className="rounded-xl bg-amber-50 px-4 py-3 text-amber-900 ring-1 ring-amber-200">
            {t("temporaryNotice")}
          </p>
        )}

        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
          <PasswordForm action={changePasswordAction.bind(null, locale)} />
        </div>

        {staff.mustChangePassword && (
          <form action={signOutAction.bind(null, locale)}>
            <button type="submit" className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm hover:bg-gray-100">
              {tHome("signOut")}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
