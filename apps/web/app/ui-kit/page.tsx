import type { Metadata } from 'next';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  DataTable,
  EmptyState,
  ErrorState,
  SelectField,
  Skeleton,
  StatusBadge,
  TextField,
} from '../components/ui';

export const metadata: Metadata = {
  title: 'UI Kit | JASLYN NET',
  description: 'Shared UI primitives and interaction states for the JASLYN NET web application.',
};

type DemoCustomer = { id: string; name: string; plan: string; status: 'Active' | 'Suspended' };

const demoCustomers: DemoCustomer[] = [
  { id: 'JN-2048', name: 'Amina Joseph', plan: 'Business 30 Mbps', status: 'Active' },
  { id: 'JN-2049', name: 'Baraka Mushi', plan: 'Home 10 Mbps', status: 'Suspended' },
  { id: 'JN-2050', name: 'Neema Peter', plan: 'Business 30 Mbps', status: 'Active' },
];

const columns = [
  { key: 'customer', header: 'Customer', render: (row: DemoCustomer) => <strong>{row.name}</strong> },
  { key: 'id', header: 'Reference', render: (row: DemoCustomer) => row.id },
  { key: 'plan', header: 'Package', render: (row: DemoCustomer) => row.plan },
  {
    key: 'status',
    header: 'Status',
    render: (row: DemoCustomer) => (
      <StatusBadge tone={row.status === 'Active' ? 'success' : 'warning'} dot>{row.status}</StatusBadge>
    ),
  },
];

export default function UiKitPage() {
  return (
    <main className="jn-kit">
      <header className="jn-kit__hero">
        <p className="jn-kit__eyebrow">DESIGN SYSTEM / FOUNDATION</p>
        <h1>Shared UI primitives</h1>
        <p>Accessible, composable building blocks for customer, billing and network operations workflows.</p>
      </header>

      <section className="jn-kit__section" aria-labelledby="buttons-heading">
        <div className="jn-kit__section-heading">
          <h2 id="buttons-heading">Actions</h2>
          <p>Native buttons with clear hierarchy and explicit loading behavior.</p>
        </div>
        <div className="jn-kit__row">
          <Button>Save changes</Button>
          <Button variant="secondary">Cancel</Button>
          <Button variant="ghost">View details</Button>
          <Button variant="danger">Suspend service</Button>
          <Button isLoading loadingText="Saving">Save</Button>
        </div>
      </section>

      <section className="jn-kit__section" aria-labelledby="status-heading">
        <div className="jn-kit__section-heading">
          <h2 id="status-heading">Feedback and status</h2>
          <p>Use tone and text together; never rely on color alone to communicate meaning.</p>
        </div>
        <div className="jn-kit__row">
          <StatusBadge tone="success" dot>Online</StatusBadge>
          <StatusBadge tone="warning" dot>Pending</StatusBadge>
          <StatusBadge tone="danger" dot>Failed</StatusBadge>
          <StatusBadge tone="info">Scheduled</StatusBadge>
          <StatusBadge>Unknown</StatusBadge>
        </div>
        <div className="jn-kit__stack">
          <Alert tone="success" title="Changes saved">Your service settings have been updated.</Alert>
          <Alert tone="warning" title="Action required">This device has not checked in recently. Verify its connection before provisioning.</Alert>
          <Alert tone="danger" title="Unable to save">The request failed. Check your connection and try again.</Alert>
        </div>
      </section>

      <section className="jn-kit__section" aria-labelledby="error-state-heading">
        <div className="jn-kit__section-heading">
          <h2 id="error-state-heading">Recoverable errors</h2>
          <p>Explain what failed and provide a genuine recovery action when one is available.</p>
        </div>
        <ErrorState
          title="Unable to load network inventory"
          description="The inventory service did not respond. Your existing configuration has not been changed."
          action={<Button variant="secondary" onClick={() => window.location.reload()}>Retry by reloading</Button>}
        />
      </section>

      <section className="jn-kit__section" aria-labelledby="form-heading">
        <div className="jn-kit__section-heading">
          <h2 id="form-heading">Form controls</h2>
          <p>Visible labels, connected help text, and inline validation messages.</p>
        </div>
        <Card>
          <CardContent>
            <div className="jn-kit__form">
              <TextField label="Workspace name" placeholder="e.g. Mwanza Office" hint="Use a name that helps your team identify this workspace." />
              <TextField label="Contact email" type="email" placeholder="ops@example.com" required error="Enter a valid email address." />
              <SelectField label="Service status" defaultValue="active">
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="suspended">Suspended</option>
              </SelectField>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="jn-kit__section" aria-labelledby="table-heading">
        <div className="jn-kit__section-heading">
          <h2 id="table-heading">Data table</h2>
          <p>Typed columns, stable row keys, horizontal scrolling and explicit loading/empty states.</p>
        </div>
        <DataTable
          caption="Example customer accounts"
          columns={columns}
          rows={demoCustomers}
          getRowKey={(row) => row.id}
        />
      </section>

      <section className="jn-kit__section" aria-labelledby="states-heading">
        <div className="jn-kit__section-heading">
          <h2 id="states-heading">Loading and empty states</h2>
          <p>Keep layouts stable during loading and tell users what they can do next.</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>Latest changes across your workspace.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="jn-kit__skeletons" role="status" aria-label="Loading recent activity">
              <Skeleton width="42%" height="14px" />
              <Skeleton width="76%" height="12px" />
              <Skeleton width="58%" height="12px" />
            </div>
          </CardContent>
          <CardFooter><Button variant="secondary" size="sm">Refresh activity</Button></CardFooter>
        </Card>
        <Card>
          <CardContent>
            <EmptyState
              title="No incidents found"
              description="There are no incidents matching the selected filters. Try widening the date range or clearing filters."
              action={<Button variant="secondary">Clear filters</Button>}
              icon={<span aria-hidden="true">✓</span>}
            />
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
