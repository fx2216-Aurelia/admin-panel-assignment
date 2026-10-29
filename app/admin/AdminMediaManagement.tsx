'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';

interface Generation {
    id: string;
    user_id: string;
    prompt: string;
    output_text: string;
    created_at: string;
    hug_count?: number | null;
    coffee_count?: number | null;
    image_url?: string | null;
}

interface MediaContent {
    analysis?: string;
    image_url?: string;
    author_name?: string;
    [key: string]: unknown;
}

interface AdminMediaManagementProps {
    userId: string;
}

const PAGE_SIZE = 500;

function getMediaContent(outputText: string): MediaContent {
    try {
        const parsed: unknown = JSON.parse(outputText);
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
            return parsed as MediaContent;
        }
    } catch {
        // Older posts store the coping response as plain text.
    }

    return { analysis: outputText };
}

function getImageUrl(post: Generation, content: MediaContent): string {
    return post.image_url || content.image_url || '';
}

function getAuthor(content: MediaContent, userId: string): string {
    if (typeof content.author_name === 'string' && content.author_name.trim()) {
        return content.author_name;
    }
    return `Community member · ${userId.slice(0, 8)}`;
}

function isHttpUrl(value: string): boolean {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' || url.protocol === 'http:';
    } catch {
        return false;
    }
}

export default function AdminMediaManagement({ userId }: AdminMediaManagementProps) {
    const [supabase] = useState(() => createClient());
    const [posts, setPosts] = useState<Generation[]>([]);
    const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingPost, setEditingPost] = useState<Generation | null>(null);
    const [ventText, setVentText] = useState('');
    const [copingResponse, setCopingResponse] = useState('');
    const [imageUrl, setImageUrl] = useState('');
    const [saving, setSaving] = useState(false);
    const [modalError, setModalError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const loadPosts = useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        try {
            const loadedPosts: Generation[] = [];
            for (let offset = 0; ; offset += PAGE_SIZE) {
                const { data, error } = await supabase
                    .from('generations')
                    .select('*')
                    .order('created_at', { ascending: false })
                    .order('id', { ascending: true })
                    .range(offset, offset + PAGE_SIZE - 1);
                if (error) throw error;
                const page = data ?? [];
                loadedPosts.push(...page);
                if (page.length < PAGE_SIZE) break;
            }

            const counts: Record<string, number> = {};
            for (let offset = 0; ; offset += PAGE_SIZE) {
                const { data, error } = await supabase
                    .from('feed_comments')
                    .select('generation_id')
                    .order('id', { ascending: true })
                    .range(offset, offset + PAGE_SIZE - 1);
                if (error) throw error;
                const page = data ?? [];
                for (const comment of page) {
                    counts[comment.generation_id] = (counts[comment.generation_id] ?? 0) + 1;
                }
                if (page.length < PAGE_SIZE) break;
            }

            setPosts(loadedPosts);
            setCommentCounts(counts);
        } catch (error) {
            console.error('Could not load admin media:', error);
            setLoadError(error instanceof Error ? error.message : 'Posts and interactions could not be loaded.');
        } finally {
            setLoading(false);
        }
    }, [supabase]);

    useEffect(() => {
        let cancelled = false;
        void Promise.resolve().then(() => {
            if (!cancelled) return loadPosts();
        });
        return () => {
            cancelled = true;
        };
    }, [loadPosts]);

    const openCreateModal = () => {
        setEditingPost(null);
        setVentText('');
        setCopingResponse('');
        setImageUrl('');
        setModalError(null);
        setModalOpen(true);
    };

    const openEditModal = (post: Generation) => {
        const content = getMediaContent(post.output_text);
        setEditingPost(post);
        setVentText(post.prompt);
        setCopingResponse(typeof content.analysis === 'string' ? content.analysis : '');
        setImageUrl(getImageUrl(post, content));
        setModalError(null);
        setModalOpen(true);
    };

    const closeModal = () => {
        if (saving) return;
        setModalOpen(false);
        setModalError(null);
    };

    const savePost = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const prompt = ventText.trim();
        const analysis = copingResponse.trim();
        const mediaUrl = imageUrl.trim();
        if (!prompt || !analysis || !mediaUrl) {
            setModalError('Vent text, AI coping response, and image URL are all required.');
            return;
        }
        if (!isHttpUrl(mediaUrl)) {
            setModalError('Enter a valid HTTP or HTTPS image URL.');
            return;
        }

        setSaving(true);
        setModalError(null);
        setNotice(null);
        try {
            if (editingPost) {
                const currentContent = getMediaContent(editingPost.output_text);
                const outputText = JSON.stringify({
                    ...currentContent,
                    analysis,
                    image_url: mediaUrl,
                });
                const { data, error } = await supabase
                    .from('generations')
                    .update({ output_text: outputText })
                    .eq('id', editingPost.id)
                    .select('id')
                    .maybeSingle();
                if (error) throw error;
                if (!data) throw new Error('The post was not updated. Check that you still have admin access.');
                setNotice('Polaroid updated.');
            } else {
                const outputText = JSON.stringify({
                    analysis,
                    image_url: mediaUrl,
                    author_name: 'Morningside Admin',
                });
                const { error } = await supabase
                    .from('generations')
                    .insert({ user_id: userId, prompt, output_text: outputText });
                if (error) throw error;
                setNotice('Official Polaroid published.');
            }

            setModalOpen(false);
            await loadPosts();
        } catch (error) {
            console.error('Could not save admin media:', error);
            setModalError(error instanceof Error ? error.message : 'The post could not be saved.');
        } finally {
            setSaving(false);
        }
    };

    const deletePost = async (post: Generation) => {
        if (!window.confirm('Delete this Polaroid? Its comments and reactions may also be removed. This cannot be undone.')) {
            return;
        }

        setDeletingId(post.id);
        setNotice(null);
        setLoadError(null);
        try {
            const { data, error } = await supabase
                .from('generations')
                .delete()
                .eq('id', post.id)
                .select('id')
                .maybeSingle();
            if (error) throw error;
            if (!data) throw new Error('The post was not deleted. Check that you still have admin access.');
            setNotice('Polaroid deleted.');
            await loadPosts();
        } catch (error) {
            console.error('Could not delete admin media:', error);
            setLoadError(error instanceof Error ? error.message : 'The post could not be deleted.');
        } finally {
            setDeletingId(null);
        }
    };

    const totalHugs = posts.reduce((total, post) => total + (post.hug_count ?? 0), 0);
    const totalCoffees = posts.reduce((total, post) => total + (post.coffee_count ?? 0), 0);

    return (
        <section aria-labelledby="media-management-heading">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h2 id="media-management-heading" className="font-serif text-2xl font-semibold text-slate-800">
                        Polaroid &amp; Vent Management
                    </h2>
                    <p className="mt-1 text-sm text-slate-600">
                        Manage community posts and review the support they receive.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={openCreateModal}
                    className="rounded-xl bg-[#e2959c] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-[#d7828a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d7828a]"
                >
                    Publish official Polaroid
                </button>
            </div>

            <div className="mb-6 grid gap-4 sm:grid-cols-3">
                <MetricCard label="Total Polaroids / Posts" value={posts.length} detail="Community feed" />
                <MetricCard label="Total Hugs Given" value={totalHugs} detail="Empathy reactions" />
                <MetricCard label="Total Coffees Offered" value={totalCoffees} detail="Support reactions" />
            </div>

            {notice && (
                <p role="status" className="mb-4 rounded-xl border border-[#e8ede9] bg-[#f4f7f4] px-4 py-3 text-sm text-[#385e49]">
                    {notice}
                </p>
            )}
            {loadError && (
                <div role="alert" className="mb-4 rounded-xl border border-[#f2d8dc] bg-[#fbf0f1] px-4 py-3 text-sm text-[#9f4f59]">
                    <p>Media management failed: {loadError}</p>
                    <button type="button" onClick={() => void loadPosts()} className="mt-2 font-semibold underline">
                        Retry loading
                    </button>
                </div>
            )}

            <div className="overflow-x-auto rounded-2xl border border-[#d7ded6] bg-white shadow-[0_4px_20px_-4px_rgba(40,60,50,0.06)]">
                <table className="w-full min-w-[1050px] text-left text-sm">
                    <thead className="border-b border-[#d4ded4] bg-[#ebf0eb] text-xs font-semibold uppercase tracking-wide text-[#3e5649]">
                        <tr>
                            <th scope="col" className="px-4 py-3">Polaroid Preview / Media</th>
                            <th scope="col" className="px-4 py-3">Vent Text &amp; AI Coping Response</th>
                            <th scope="col" className="px-4 py-3">🫂 Hugs Count</th>
                            <th scope="col" className="px-4 py-3">☕ Coffee on Me Count</th>
                            <th scope="col" className="px-4 py-3">💬 Comments Count</th>
                            <th scope="col" className="px-4 py-3">Author / Date</th>
                            <th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e9eee9]">
                        {loading ? (
                            <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-500">Loading Polaroids and interactions…</td></tr>
                        ) : posts.length === 0 ? (
                            <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-500">No posts have been published yet.</td></tr>
                        ) : posts.map((post) => {
                            const content = getMediaContent(post.output_text);
                            const mediaUrl = getImageUrl(post, content);
                            return (
                                <tr key={post.id} className="align-top border-b border-[#e9eee9] transition-colors hover:bg-[#fafbfa]">
                                    <td className="px-4 py-4">
                                        {mediaUrl ? (
                                            <a href={mediaUrl} target="_blank" rel="noreferrer" aria-label="Open Polaroid media in a new tab">
                                                <img
                                                    src={mediaUrl}
                                                    alt="Polaroid preview"
                                                    className="h-20 w-28 rounded-lg border border-[#d7ded6] object-cover"
                                                />
                                            </a>
                                        ) : (
                                            <div className="flex h-20 w-28 items-center justify-center rounded-lg border border-dashed border-[#d7ded6] bg-[#f4f7f4] text-xs text-slate-400">
                                                No image
                                            </div>
                                        )}
                                    </td>
                                    <td className="max-w-md px-4 py-4">
                                        <p className="font-semibold leading-5 text-slate-800">{post.prompt}</p>
                                        <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-xs leading-5 text-slate-600">
                                            {typeof content.analysis === 'string' ? content.analysis : 'No coping response'}
                                        </p>
                                    </td>
                                    <td className="px-4 py-4 font-semibold text-[#385e49]">{post.hug_count ?? 0}</td>
                                    <td className="px-4 py-4 font-semibold text-[#b4656f]">{post.coffee_count ?? 0}</td>
                                    <td className="px-4 py-4 font-semibold text-slate-700">{commentCounts[post.id] ?? 0}</td>
                                    <td className="px-4 py-4">
                                        <p className="font-medium text-slate-700">{getAuthor(content, post.user_id)}</p>
                                        <time dateTime={post.created_at} className="mt-1 block whitespace-nowrap text-xs text-slate-400">
                                            {new Date(post.created_at).toLocaleString()}
                                        </time>
                                    </td>
                                    <td className="px-4 py-4">
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() => openEditModal(post)}
                                                className="rounded-lg bg-[#edf4f0] px-3 py-1.5 text-xs font-semibold text-[#3d614e] transition hover:bg-[#dfece3]"
                                            >
                                                Edit
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => void deletePost(post)}
                                                disabled={deletingId === post.id}
                                                className="rounded-lg bg-[#fdf0f0] px-3 py-1.5 text-xs font-semibold text-[#b45353] transition hover:bg-[#fae2e2] disabled:opacity-50"
                                            >
                                                {deletingId === post.id ? 'Deleting…' : 'Delete'}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {modalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/30 p-4 backdrop-blur-sm">
                    <section
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="media-modal-heading"
                        className="my-auto w-full max-w-2xl rounded-2xl border border-[#d7ded6] bg-white p-6 shadow-[0_4px_20px_-4px_rgba(40,60,50,0.12)] sm:p-8"
                    >
                        <div className="mb-6 flex items-start justify-between gap-4">
                            <div>
                                <h3 id="media-modal-heading" className="font-serif text-2xl font-semibold text-slate-800">
                                    {editingPost ? 'Edit Polaroid' : 'Publish an official Polaroid'}
                                </h3>
                                <p className="mt-1 text-sm text-slate-600">
                                    {editingPost ? 'Update its AI coping response or media.' : 'Add a vent, supportive response, and image to the feed.'}
                                </p>
                            </div>
                            <button type="button" onClick={closeModal} disabled={saving} aria-label="Close dialog" className="rounded-lg px-2 py-1 text-xl text-slate-400 hover:bg-[#f4f7f4]">
                                ×
                            </button>
                        </div>

                        <form onSubmit={savePost} className="space-y-5">
                            <label className="block">
                                <span className="mb-1.5 block text-sm font-semibold text-slate-700">User vent text</span>
                                <textarea
                                    value={ventText}
                                    onChange={(event) => setVentText(event.target.value)}
                                    readOnly={Boolean(editingPost)}
                                    required
                                    rows={3}
                                    className="w-full rounded-xl border border-[#cfd7cf] bg-[#fcfdfc] px-3 py-2.5 text-sm text-[#2c3e35] placeholder:text-[#9ea8a0] outline-none focus:border-[#6b8f78] focus:bg-white focus:ring-2 focus:ring-[#6b8f78]/20 read-only:bg-[#f4f7f4]"
                                />
                            </label>
                            <label className="block">
                                <span className="mb-1.5 block text-sm font-semibold text-slate-700">AI coping message</span>
                                <textarea
                                    value={copingResponse}
                                    onChange={(event) => setCopingResponse(event.target.value)}
                                    required
                                    rows={5}
                                    className="w-full rounded-xl border border-[#cfd7cf] bg-[#fcfdfc] px-3 py-2.5 text-sm text-[#2c3e35] placeholder:text-[#9ea8a0] outline-none focus:border-[#6b8f78] focus:bg-white focus:ring-2 focus:ring-[#6b8f78]/20"
                                />
                            </label>
                            <label className="block">
                                <span className="mb-1.5 block text-sm font-semibold text-slate-700">Image URL</span>
                                <input
                                    type="url"
                                    value={imageUrl}
                                    onChange={(event) => setImageUrl(event.target.value)}
                                    required
                                    placeholder="https://example.com/polaroid.jpg"
                                    className="w-full rounded-xl border border-[#cfd7cf] bg-[#fcfdfc] px-3 py-2.5 text-sm text-[#2c3e35] placeholder:text-[#9ea8a0] outline-none focus:border-[#6b8f78] focus:bg-white focus:ring-2 focus:ring-[#6b8f78]/20"
                                />
                            </label>

                            {modalError && (
                                <p role="alert" className="rounded-xl border border-[#f2d8dc] bg-[#fbf0f1] px-4 py-3 text-sm text-[#9f4f59]">
                                    {modalError}
                                </p>
                            )}
                            <div className="flex justify-end gap-3 border-t border-[#e9eee9] pt-5">
                                <button
                                    type="button"
                                    onClick={closeModal}
                                    disabled={saving}
                                    className="rounded-xl border border-[#cfd7cf] px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-[#f4f7f4] disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="rounded-xl bg-[#e2959c] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-[#d7828a] disabled:opacity-50"
                                >
                                    {saving ? 'Saving…' : editingPost ? 'Save changes' : 'Publish Polaroid'}
                                </button>
                            </div>
                        </form>
                    </section>
                </div>
            )}
        </section>
    );
}

function MetricCard({ label, value, detail }: { label: string; value: number; detail: string }) {
    return (
        <article className="rounded-2xl border border-[#d7ded6] bg-white p-5 shadow-[0_4px_20px_-4px_rgba(40,60,50,0.06)]">
            <p className="text-sm font-medium text-slate-600">{label}</p>
            <p className="mt-2 font-serif text-3xl font-semibold tabular-nums text-[#385e49]">{value.toLocaleString()}</p>
            <p className="mt-1 text-xs text-slate-400">{detail}</p>
        </article>
    );
}
