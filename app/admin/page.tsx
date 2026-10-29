import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';
import AdminDashboardTabs, { type AdminProfile } from './components/AdminDashboardTabs';

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
            <main className="mx-auto max-w-3xl p-8 text-center text-slate-800">
                <h1 className="text-2xl font-semibold">Access denied</h1>
                <p className="mt-2 text-sm text-slate-600">You do not have permission to access the Admin Panel.</p>
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
        <main className="min-h-screen bg-[#f5f4ef] px-4 py-8 text-slate-800 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-7xl">
                <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-[#d7ded6] pb-6">
                    <div>
                        <p className="inline-flex rounded-full border border-[#f2d8dc] bg-[#fbf0f1] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#b4656f]">
                            Morningside Vent Feed
                        </p>
                        <div className="mt-2 flex items-center gap-3">
                            <h1 className="font-serif text-3xl font-semibold text-slate-800">Admin Dashboard</h1>
                            <span
                                aria-hidden="true"
                                className="admin-heart-cluster relative inline-flex cursor-pointer items-center justify-center transition-transform duration-300 hover:scale-125"
                            >
                                <span className="admin-heart-glow absolute inset-0 rounded-full bg-[#f2d8dc]/60 blur-md" />
                                <svg className="admin-heart-float relative -mr-1 size-4 fill-[#e2959c]" viewBox="0 0 24 24">
                                    <path d="M12 21s-8.5-5.3-8.5-12A4.5 4.5 0 0 1 12 6.2 4.5 4.5 0 0 1 20.5 9c0 6.7-8.5 12-8.5 12Z" />
                                </svg>
                                <svg className="admin-heart-float relative z-10 size-5 fill-[#f3b2b8]" viewBox="0 0 24 24">
                                    <path d="M12 21s-8.5-5.3-8.5-12A4.5 4.5 0 0 1 12 6.2 4.5 4.5 0 0 1 20.5 9c0 6.7-8.5 12-8.5 12Z" />
                                </svg>
                                <svg className="admin-heart-float relative -ml-1 size-3 fill-[#d7828a]" viewBox="0 0 24 24">
                                    <path d="M12 21s-8.5-5.3-8.5-12A4.5 4.5 0 0 1 12 6.2 4.5 4.5 0 0 1 20.5 9c0 6.7-8.5 12-8.5 12Z" />
                                </svg>
                            </span>
                        </div>
                    </div>
                    <span className="rounded-full border border-[#f2d8dc] bg-[#fbf0f1] px-4 py-2 text-sm font-semibold text-[#b4656f]">
                        Superadmin
                    </span>
                </header>
                <AdminDashboardTabs userId={user.id} profiles={(profiles ?? []) as AdminProfile[]} />
            </div>
        </main>
    );
}
