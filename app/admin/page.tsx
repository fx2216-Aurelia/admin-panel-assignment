import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';
import AdminMediaManagement from './AdminMediaManagement';

interface Profile {
    id: string;
    email: string | null;
    is_superadmin: boolean | null;
}

export default async function AdminPage() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect('/login');

    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('is_superadmin')
        .eq('id', user.id)
        .single();

    if (profileError) {
        throw new Error(`Could not verify admin access: ${profileError.message}`);
    }

    if (!profile?.is_superadmin) {
        return (
            <main className="mx-auto max-w-3xl p-8 text-center">
                <h1 className="text-2xl font-semibold text-stone-900">Access denied</h1>
                <p className="mt-2 text-sm text-stone-600">You do not have permission to access the Admin Panel.</p>
            </main>
        );
    }

    const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email, is_superadmin')
        .order('email', { ascending: true });

    if (profilesError) {
        throw new Error(`Could not load admin user list: ${profilesError.message}`);
    }

    return (
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-stone-200 pb-6">
                <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-700">Morningside Vent Feed</p>
                    <h1 className="mt-1 font-serif text-3xl font-semibold text-stone-900">Admin Panel</h1>
                </div>
                <span className="rounded-full bg-emerald-100 px-4 py-2 text-sm font-semibold text-emerald-800">
                    Welcome, Admin
                </span>
            </header>

            <AdminMediaManagement userId={user.id} />

            <section className="mt-12" aria-labelledby="user-management-heading">
                <div className="mb-4">
                    <h2 id="user-management-heading" className="font-serif text-2xl font-semibold text-stone-900">
                        User Management
                    </h2>
                    <p className="mt-1 text-sm text-stone-600">Accounts and Admin Panel access.</p>
                </div>
                <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white shadow-sm">
                    <table className="w-full min-w-[28rem] text-left text-sm">
                        <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-600">
                            <tr>
                                <th scope="col" className="px-5 py-3">Email</th>
                                <th scope="col" className="px-5 py-3">Role</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-100">
                            {((profiles ?? []) as Profile[]).map((listedProfile) => (
                                <tr key={listedProfile.id}>
                                    <td className="px-5 py-3 text-stone-800">{listedProfile.email ?? 'No email'}</td>
                                    <td className="px-5 py-3">
                                        <span className={listedProfile.is_superadmin
                                            ? 'rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800'
                                            : 'rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-700'}
                                        >
                                            {listedProfile.is_superadmin ? 'Admin' : 'User'}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>
        </main>
    );
}
