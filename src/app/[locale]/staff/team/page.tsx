import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { can, isAssignableRole } from "@/domain/restaurant/role";
import { localized } from "@/domain/shared/localized";
import { team } from "@/infrastructure/container";
import { formatDayTime } from "@/interface/web/format";
import { initLocale } from "@/interface/web/i18n/init-locale";
import { requireStaff } from "@/interface/web/staff/require-staff";
import { addMemberAction, changeMemberRoleAction, issueMemberPasswordAction, removeMemberAction } from "@/interface/web/staff/team-actions";
import { AddMemberForm, MemberActions } from "@/interface/web/staff/team-forms";

// The restaurant's staff, for the owner and the manager (permission `staff:manage`): who works here and with which
// role, adding a manager / waiter / cashier, and changing, re-passwording or removing a member.
export default async function TeamPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await initLocale(params);
  const { restaurant, staff } = await requireStaff(locale);
  if (!can(staff.role, "staff:manage")) notFound();

  const members = await team.list({ restaurantId: staff.restaurantId, role: staff.role, userId: staff.userId });
  if (!members.ok) notFound();
  const t = await getTranslations("Team");
  const roles = await getTranslations("Roles");

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
        <header>
          <Link href={`/${locale}/staff`} className="text-sm text-gray-500 hover:text-gray-900">
            <span aria-hidden className="inline-block rtl:-scale-x-100">←</span> {t("backToDashboard")}
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-gray-500">{localized(restaurant.name, locale)}</p>
        </header>

        <section aria-labelledby="add-member" className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
          <h2 id="add-member" className="mb-4 text-lg font-semibold">
            {t("addTitle")}
          </h2>
          <AddMemberForm action={addMemberAction.bind(null, locale)} />
        </section>

        <section aria-labelledby="members" className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
          <h2 id="members" className="mb-2 text-lg font-semibold">
            {t("listTitle", { count: members.value.length })}
          </h2>
          <ul className="divide-y divide-gray-100">
            {members.value.map((member) => {
              const isSelf = member.userId === staff.userId;
              return (
                <li key={member.userId} aria-label={member.email} className="flex flex-col gap-2 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                    <p className="font-semibold">
                      <bdi dir="ltr">{member.email}</bdi>
                      {isSelf && <span className="ms-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-normal text-gray-600">{t("you")}</span>}
                    </p>
                    <p className="text-sm text-gray-500">
                      <span className="font-semibold text-gray-900">{roles(member.role)}</span> · {t("joined")} <bdi>{formatDayTime(member.joinedAt, locale)}</bdi>
                    </p>
                  </div>
                  {member.role === "OWNER" && !isSelf && <p className="text-sm text-gray-500">{t("ownerNote")}</p>}
                  {!isSelf && isAssignableRole(member.role) && (
                    <MemberActions
                      email={member.email}
                      role={member.role}
                      changeRole={changeMemberRoleAction.bind(null, locale, member.userId)}
                      issuePassword={issueMemberPasswordAction.bind(null, locale, member.userId)}
                      remove={removeMemberAction.bind(null, locale, member.userId)}
                    />
                  )}
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-sm text-gray-500">{t("selfNote")}</p>
        </section>
      </div>
    </main>
  );
}
