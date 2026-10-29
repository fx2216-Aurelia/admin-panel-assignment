'use client';

import { useState } from 'react';
import AdminMediaManagement from '../AdminMediaManagement';
import AccessControlManager from './AccessControlManager';
import LLMManager from './LLMManager';
import LLMLogsViewer from './LLMLogsViewer';
import AdminPromptChains from './AdminPromptChains';
import TermsAndExamples from './TermsAndExamples';

export interface AdminProfile {
    id: string;
    email: string | null;
    is_superadmin: boolean | null;
}

interface AdminDashboardTabsProps {
    userId: string;
    profiles: AdminProfile[];
}

const tabs = [
    'Access Control',
    'LLM & Models',
    'Prompt Chains',
    'Terms & Examples',
    'LLM Logs',
    'Media & Users',
] as const;

type AdminTab = (typeof tabs)[number];

export default function AdminDashboardTabs({ userId, profiles }: AdminDashboardTabsProps) {
    const [activeTab, setActiveTab] = useState<AdminTab>('Access Control');

    return (
        <>
            <nav aria-label="Admin dashboard sections" className="mb-6 overflow-x-auto rounded-t-2xl border border-[#d7ded6] bg-white px-2 shadow-[0_4px_20px_-4px_rgba(40,60,50,0.06)]">
                <div className="flex min-w-max gap-1">
                    {tabs.map((tab) => (
                        <button
                            key={tab}
                            type="button"
                            role="tab"
                            aria-selected={activeTab === tab}
                            onClick={() => setActiveTab(tab)}
                            className={`border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
                                activeTab === tab
                                    ? 'border-[#5b8a70] bg-[#eef4f0] text-[#3d614e]'
                                    : 'border-transparent text-slate-500 hover:bg-[#f4f7f4] hover:text-slate-800'
                            }`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>
            </nav>

            <div role="tabpanel" className="min-h-96 rounded-b-2xl border-x border-b border-[#d7ded6] bg-white p-4 shadow-[0_4px_20px_-4px_rgba(40,60,50,0.06)] sm:p-6">
                {activeTab === 'Access Control' && <AccessControlManager />}
                {activeTab === 'LLM & Models' && <LLMManager />}
                {activeTab === 'Prompt Chains' && <AdminPromptChains />}
                {activeTab === 'Terms & Examples' && <TermsAndExamples />}
                {activeTab === 'LLM Logs' && <LLMLogsViewer />}
                {activeTab === 'Media & Users' && (
                    <div className="space-y-12">
                        <AdminMediaManagement userId={userId} />
                        <section aria-labelledby="users-heading">
                            <SectionHeading id="users-heading" title="User Management" description="Accounts and Admin Panel access." />
                            <div className="overflow-x-auto rounded-2xl border border-[#d7ded6] bg-white shadow-[0_4px_20px_-4px_rgba(40,60,50,0.06)]">
                                <table className="w-full min-w-[28rem] text-left text-sm">
                                    <thead className="border-b border-[#d4ded4] bg-[#ebf0eb] text-xs font-semibold uppercase tracking-wide text-[#3e5649]">
                                        <tr className="text-left">
                                            <th scope="col" className="px-5 py-3">Email</th>
                                            <th scope="col" className="px-5 py-3">Role</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[#e9eee9]">
                                        {profiles.map((profile) => (
                                            <tr key={profile.id} className="border-b border-[#e9eee9] transition-colors hover:bg-[#fafbfa]">
                                                <td className="px-5 py-3 text-slate-700">{profile.email ?? 'No email'}</td>
                                                <td className="px-5 py-3">
                                                    <span className={profile.is_superadmin
                                                        ? 'rounded-full border border-[#f2d8dc] bg-[#fbf0f1] px-2.5 py-1 text-xs font-semibold text-[#b4656f]'
                                                        : 'rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600'}
                                                    >
                                                        {profile.is_superadmin ? 'Superadmin' : 'User'}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    </div>
                )}
            </div>
        </>
    );
}

function SectionHeading({ id, title, description }: { id: string; title: string; description: string }) {
    return (
        <div className="mb-5">
            <h2 id={id} className="font-serif text-2xl font-semibold text-slate-800">{title}</h2>
            <p className="mt-1 text-sm text-slate-600">{description}</p>
        </div>
    );
}
