import {
  Page,
  PageHeader,
  PageHeading,
  PageTitle,
} from "@masdan/ui/components/page";
import { Tabs, TabsList, TabsTab } from "@masdan/ui/components/tabs";
import {
  Link,
  Outlet,
  createFileRoute,
  useRouterState,
} from "@tanstack/react-router";

/** Settings: one narrow column, sections switched by a segmented control. */
const SettingsLayout = () => {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const section = pathname.startsWith("/settings/household")
    ? "household"
    : "profile";

  return (
    <Page width="narrow">
      <PageHeader>
        <PageHeading>
          <PageTitle>Settings</PageTitle>
        </PageHeading>
      </PageHeader>
      <Tabs value={section}>
        <TabsList aria-label="Settings sections">
          <TabsTab
            nativeButton={false}
            render={<Link to="/settings" />}
            value="profile"
          >
            Profile
          </TabsTab>
          <TabsTab
            nativeButton={false}
            render={<Link to="/settings/household" />}
            value="household"
          >
            Household
          </TabsTab>
        </TabsList>
      </Tabs>
      <Outlet />
    </Page>
  );
};

export const Route = createFileRoute("/_auth/settings")({
  component: SettingsLayout,
  head: () => ({ meta: [{ title: "Settings" }] }),
});
