'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/client';
import { cancelCoffeeOffer, castVote, postFeedComment } from '@/app/actions/vote';
import GoogleSignInButton from '@/components/GoogleSignInButton';
import SignOutButton from '@/components/SignOutButton';
import StoicLoader from '@/components/StoicLoader';
import VentCard from '@/components/VentCard';
import { LionSticker, type StickerPosition } from '@/components/LionSticker';
import type { VentJournalActions } from '@/components/VentCard';
import { toPng } from 'html-to-image';

type ToneType = 'gentle' | 'roast';
type FeedSort = 'latest' | 'highest-stress';
type ReactionType = 'hug' | 'coffee';
type FeedTab = 'explore' | 'mine' | 'interacted';
type SocialPlatform = 'WeChat' | 'Instagram' | 'LinkedIn' | 'Facebook';

const FEED_PAGE_SIZE = 10;
const LOCAL_POSTS_STORAGE_KEY = 'meditations-local-vent-posts';

const mascotMessages = [
    "Take a deep breath ✨",
    "You've got this! 💙",
    "Butler can't stop you ☕",
    'Proud of your hard work today 🌿',
];

interface Generation {
    id: string;
    user_id: string;
    prompt: string;
    output_text: string;
    stress_level?: number | null;
    tone_type?: ToneType | null;
    stoic_quote?: string | null;
    image_prompt?: string;
    image_url?: string;
    imageUrl?: string;
    base64Image?: string;
    image_fallback?: boolean;
    imagePreloaded?: boolean;
    userImage?: string | null;
    userUploadedImage?: string | null;
    stickerPosition?: StickerPosition;
    created_at: string;
    hug_count?: number | null;
    coffee_count?: number | null;
}

interface FeedPost extends Generation {
    readonly imageUrl: string;
    readonly imagePrompt?: string;
}

function isStoredFeedPost(value: unknown): value is FeedPost {
    return (
        typeof value === 'object' &&
        value !== null &&
        'id' in value && typeof value.id === 'string' &&
        'user_id' in value && typeof value.user_id === 'string' &&
        'prompt' in value && typeof value.prompt === 'string' &&
        'output_text' in value && typeof value.output_text === 'string' &&
        'created_at' in value && typeof value.created_at === 'string' &&
        'imageUrl' in value && typeof value.imageUrl === 'string' &&
        (!('userImage' in value) || value.userImage === null || typeof value.userImage === 'string') &&
        (!('userUploadedImage' in value) || value.userUploadedImage === null || typeof value.userUploadedImage === 'string') &&
        (!('stickerPosition' in value) || value.stickerPosition === undefined ||
            (typeof value.stickerPosition === 'object' && value.stickerPosition !== null &&
                'x' in value.stickerPosition && typeof value.stickerPosition.x === 'number' &&
                'y' in value.stickerPosition && typeof value.stickerPosition.y === 'number' &&
                'scale' in value.stickerPosition && typeof value.stickerPosition.scale === 'number' &&
                'rotation' in value.stickerPosition && typeof value.stickerPosition.rotation === 'number'))
    );
}

function getUserUploadedImage(post: Pick<Generation, 'userImage' | 'userUploadedImage'>): string | null {
    const image = post.userImage || post.userUploadedImage;
    return typeof image === 'string' && image.trim() ? image : null;
}

function mergeFeedPosts(current: FeedPost[], incoming: FeedPost[]): FeedPost[] {
    const postsById = new Map(current.map((post) => [post.id, post]));
    for (const post of incoming) {
        const existing = postsById.get(post.id);
        const userImage = getUserUploadedImage(existing ?? {});
        postsById.set(post.id, {
            ...post,
            ...(userImage
                ? { userImage, stickerPosition: existing?.stickerPosition }
                : {}),
        });
    }
    return [...postsById.values()].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
}

interface JournalContent {
    analysis: string;
    coping_modality?: string;
    coping_action?: string | {
        step1: string;
        step2: string;
    };
    actions?: VentJournalActions;
    scene_theme?: string;
    image_prompt?: string;
    image_url?: string;
    userImage?: string;
    stickerPosition?: StickerPosition;
    location?: string;
    author_name?: string;
}

interface ReactionState {
    hug: boolean;
    coffee: boolean;
}

interface ReactionCounts {
    hug: number;
    coffee: number;
}

interface FeedComment {
    id: string;
    generation_id: string;
    content: string;
    created_at: string;
    author_name?: string | null;
    user_id?: string | null;
}

function getJournalContent(outputText: string): JournalContent {
    try {
        const parsed: unknown = JSON.parse(outputText);
        if (
            typeof parsed === 'object' &&
            parsed !== null &&
            'analysis' in parsed &&
            typeof parsed.analysis === 'string'
        ) {
            const actions = 'actions' in parsed ? parsed.actions : undefined;
            const validActions: VentJournalActions | undefined =
                typeof actions === 'object' &&
                actions !== null &&
                'meditation' in actions &&
                typeof actions.meditation === 'string' &&
                'walk' in actions &&
                typeof actions.walk === 'string' &&
                'nearby_anchor' in actions &&
                typeof actions.nearby_anchor === 'string'
                    ? {
                          meditation: actions.meditation,
                          walk: actions.walk,
                          nearby_anchor: actions.nearby_anchor,
                      }
                    : undefined;
            const copingAction =
                'coping_action' in parsed && typeof parsed.coping_action === 'string'
                    ? parsed.coping_action
                    : 'coping_action' in parsed &&
                        typeof parsed.coping_action === 'object' &&
                        parsed.coping_action !== null &&
                        'step1' in parsed.coping_action &&
                        typeof parsed.coping_action.step1 === 'string' &&
                        'step2' in parsed.coping_action &&
                        typeof parsed.coping_action.step2 === 'string'
                        ? {
                              step1: parsed.coping_action.step1,
                              step2: parsed.coping_action.step2,
                          }
                        : undefined;

            return {
                analysis: parsed.analysis,
                coping_modality: 'coping_modality' in parsed && typeof parsed.coping_modality === 'string'
                    ? parsed.coping_modality
                    : undefined,
                coping_action: copingAction,
                actions: validActions,
                scene_theme: 'scene_theme' in parsed && typeof parsed.scene_theme === 'string'
                    ? parsed.scene_theme
                    : undefined,
                image_prompt: 'image_prompt' in parsed && typeof parsed.image_prompt === 'string'
                    ? parsed.image_prompt
                    : undefined,
                image_url: 'image_url' in parsed && typeof parsed.image_url === 'string'
                    ? parsed.image_url
                    : undefined,
                userImage: 'userImage' in parsed && typeof parsed.userImage === 'string'
                    ? parsed.userImage
                    : 'userUploadedImage' in parsed && typeof parsed.userUploadedImage === 'string'
                        ? parsed.userUploadedImage
                        : undefined,
                stickerPosition: 'stickerPosition' in parsed &&
                    typeof parsed.stickerPosition === 'object' &&
                    parsed.stickerPosition !== null &&
                    'x' in parsed.stickerPosition && typeof parsed.stickerPosition.x === 'number' &&
                    'y' in parsed.stickerPosition && typeof parsed.stickerPosition.y === 'number' &&
                    'scale' in parsed.stickerPosition && typeof parsed.stickerPosition.scale === 'number' &&
                    'rotation' in parsed.stickerPosition && typeof parsed.stickerPosition.rotation === 'number'
                    ? {
                          x: parsed.stickerPosition.x,
                          y: parsed.stickerPosition.y,
                          scale: parsed.stickerPosition.scale,
                          rotation: parsed.stickerPosition.rotation,
                      }
                    : undefined,
                location: 'location' in parsed && typeof parsed.location === 'string'
                    ? parsed.location
                    : undefined,
                author_name: 'author_name' in parsed && typeof parsed.author_name === 'string'
                    ? parsed.author_name
                    : undefined,
            };
        }
    } catch {
        // Older generations store plain analysis text rather than journal JSON.
    }

    return { analysis: outputText };
}

function getCopingSteps(
    action: JournalContent['coping_action'],
): string[] {
    if (typeof action === 'object' && action !== null) {
        return [action.step1, action.step2].filter((step) => step.trim().length > 0);
    }
    if (typeof action !== 'string' || !action.trim()) return [];

    const labeledSteps = [...action.matchAll(/(?:^|\n)\s*(?:[-•]\s*)?Step\s*\d+\s*:\s*(.+)/gi)]
        .map((match) => match[1].trim())
        .filter(Boolean);
    return labeledSteps.length > 0 ? labeledSteps : [action.trim()];
}

function formatEnglishDate(dateStrOrObj: string | Date): string {
    const date = new Date(dateStrOrObj);
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
    });
}

function createPostImageUrl(imagePrompt: string, postId: string, seed = Date.now()): string {
    const cleanPrompt = encodeURIComponent(
        `${imagePrompt}, cute storybook illustration, soft pastel colors, whimsical, original hand-painted style, high aesthetic, clean, charming diary illustration, no text`,
    );
    return `https://image.pollinations.ai/prompt/${cleanPrompt}?width=600&height=400&nologo=true&seed=${seed}`;
}

function seedFromPostId(postId: string): number {
    return [...postId].reduce(
        (value, character) => (value * 31 + character.charCodeAt(0)) >>> 0,
        7,
    );
}

function sortByTrendingScore(
    posts: FeedPost[],
    countsByGeneration: Record<string, ReactionCounts>,
): FeedPost[] {
    const now = Date.now();
    return [...posts].sort((a, b) => {
        const score = (post: FeedPost) => {
            const hoursSinceCreated = Math.max(0, (now - new Date(post.created_at).getTime()) / 3_600_000);
            const counts = countsByGeneration[post.id];
            return (counts?.coffee ?? post.coffee_count ?? 0) * 1.5 +
                (counts?.hug ?? post.hug_count ?? 0) -
                hoursSinceCreated * 0.8;
        };
        return score(b) - score(a) ||
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
}

function toFeedPost(generation: Generation, seed?: number): FeedPost {
    const content = getJournalContent(generation.output_text);
    const imagePrompt = generation.image_prompt || content.image_prompt ||
        `A cute Columbia lion cub finding calm in ${content.location || 'Morningside'}, responding to: ${generation.prompt}`;
    const stableSeed = seed ?? seedFromPostId(generation.id);

    return {
        ...generation,
        imagePrompt,
        userImage: generation.userImage || content.userImage || null,
        stickerPosition: generation.stickerPosition || content.stickerPosition,
        imageUrl: generation.imageUrl || generation.image_url || content.image_url || createPostImageUrl(imagePrompt, generation.id, stableSeed),
    };
}

function preloadImage(src: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        const timeout = window.setTimeout(() => reject(new Error('Generated illustration did not finish loading.')), 30_000);
        const finish = (loaded: boolean) => {
            window.clearTimeout(timeout);
            if (loaded) resolve(src);
            else reject(new Error('Generated illustration could not be loaded.'));
        };
        image.onload = () => finish(true);
        image.onerror = () => finish(false);
        image.src = src;
    });
}

function createPlaceholderImageDataUrl(): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#e8f4ec"/><stop offset=".55" stop-color="#f7f4e9"/><stop offset="1" stop-color="#dcebe2"/></linearGradient></defs><rect width="800" height="500" rx="28" fill="url(#bg)"/><circle cx="400" cy="205" r="115" fill="#fff5d7" opacity=".75"/><path d="M0 385q160-75 320 0t320 0 160-5v120H0Z" fill="#a8d5ba"/><path d="M0 430q170-55 340 0t340 0 120-5v75H0Z" fill="#86c8a0"/><path d="M400 285c-42-34-72-64-47-91 19-18 41-7 47 12 6-19 28-30 47-12 25 27-5 57-47 91Z" fill="#ffb6c1"/></svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function relativeTime(timestamp: string): string {
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000));
    if (elapsedSeconds < 60) return 'just now';
    if (elapsedSeconds < 3600) return `${Math.floor(elapsedSeconds / 60)}m ago`;
    if (elapsedSeconds < 86400) return `${Math.floor(elapsedSeconds / 3600)}h ago`;
    return `${Math.floor(elapsedSeconds / 86400)}d ago`;
}

export default function Home() {
    const [supabase] = useState(() => createClient());
    const [generations, setGenerations] = useState<FeedPost[]>([]);
    const [localPosts, setLocalPosts] = useState<FeedPost[]>([]);
    const localPostsRef = useRef<FeedPost[]>([]);
    const [localPostsLoaded, setLocalPostsLoaded] = useState(false);
    const [latestReflection, setLatestReflection] = useState<Generation | null>(null);
    const [feedSort, setFeedSort] = useState<FeedSort>('latest');
    const [feedTab, setFeedTab] = useState<FeedTab>('explore');
    const [visiblePostCount, setVisiblePostCount] = useState(FEED_PAGE_SIZE);
    const [loadingMorePosts, setLoadingMorePosts] = useState(false);
    const [showTrendingHelp, setShowTrendingHelp] = useState(false);
    const [locallyCommentedPosts, setLocallyCommentedPosts] = useState<Record<string, boolean>>({});
    const [feedLoading, setFeedLoading] = useState(true);
    const [feedError, setFeedError] = useState<string | null>(null);
    const [reactions, setReactions] = useState<Record<string, ReactionState>>({});
    const [reactionCounts, setReactionCounts] = useState<Record<string, ReactionCounts>>({});
    const [pendingReactions, setPendingReactions] = useState<Record<string, boolean>>({});
    const [openComments, setOpenComments] = useState<Record<string, boolean>>({});
    const [commentsByGeneration, setCommentsByGeneration] = useState<Record<string, FeedComment[]>>({});
    const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
    const [commentsLoading, setCommentsLoading] = useState<Record<string, boolean>>({});
    const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
    const [commentPosting, setCommentPosting] = useState<Record<string, boolean>>({});
    const [coffeeOfferGenerationId, setCoffeeOfferGenerationId] = useState<string | null>(null);
    const [coffeeSocialPlatform, setCoffeeSocialPlatform] = useState<SocialPlatform>('Instagram');
    const [coffeeSocialHandle, setCoffeeSocialHandle] = useState('');
    const [coffeeOfferError, setCoffeeOfferError] = useState<string | null>(null);
    const [coffeeOfferSubmitting, setCoffeeOfferSubmitting] = useState(false);
    const reactionLocks = useRef(new Set<string>());
    const latestReflectionRef = useRef<HTMLElement>(null);
    const feedListRef = useRef<HTMLDivElement>(null);
    const scenarioTextareaRef = useRef<HTMLTextAreaElement>(null);
    const feedPageTimer = useRef<number | null>(null);
    const [prompt, setPrompt] = useState('');
    const [time, setTime] = useState('');
    const [location, setLocation] = useState('');
    const [mascotMessageIndex, setMascotMessageIndex] = useState<number | null>(null);
    const [mascotAnimating, setMascotAnimating] = useState(false);
    const mascotMessageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [stressLevel, setStressLevel] = useState(5);
    const [vibeImage, setVibeImage] = useState<string | null>(null);
    const [vibeImageName, setVibeImageName] = useState<string | null>(null);
    const [vibeImageError, setVibeImageError] = useState<string | null>(null);
    const [stickerPosition, setStickerPosition] = useState<StickerPosition>({
        x: 50,
        y: 58,
        scale: 1,
        rotation: 0,
    });
    const stickerDragStart = useRef<{
        pointerId: number;
        clientX: number;
        clientY: number;
        x: number;
        y: number;
        width: number;
        height: number;
    } | null>(null);
    const [tone, setTone] = useState<ToneType>('gentle');
    const [loading, setLoading] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const generationInProgress = useRef(false);
    const [downloadingCard, setDownloadingCard] = useState<string | null>(null);
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const [generationError, setGenerationError] = useState<string | null>(null);
    const generationIdsKey = generations.map((generation) => generation.id).join(',');
    const ownGenerationIdsKey = currentUser
        ? generations
              .filter((generation) => generation.user_id === currentUser.id)
              .map((generation) => generation.id)
              .join(',')
        : '';
    const orderedGenerations = feedSort === 'highest-stress'
        ? sortByTrendingScore(generations, reactionCounts)
        : generations;
    const filteredGenerations = orderedGenerations.filter((generation) => {
        if (feedTab === 'explore') return true;
        if (feedTab === 'mine') return Boolean(currentUser && generation.user_id === currentUser.id);
        if (!currentUser) return false;
        const reaction = reactions[`${currentUser.id}:${generation.id}`];
        return Boolean(
            locallyCommentedPosts[generation.id] || reaction?.hug || reaction?.coffee,
        );
    });
    const visibleGenerations = filteredGenerations.slice(0, visiblePostCount);

    const selectFeedTab = (tab: FeedTab) => {
        if (feedPageTimer.current !== null) window.clearTimeout(feedPageTimer.current);
        setLoadingMorePosts(false);
        setFeedTab(tab);
        setVisiblePostCount(FEED_PAGE_SIZE);
        window.requestAnimationFrame(() => {
            feedListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    };

    const loadMorePosts = () => {
        if (loadingMorePosts || visiblePostCount >= filteredGenerations.length) return;
        setLoadingMorePosts(true);
        feedPageTimer.current = window.setTimeout(() => {
            setVisiblePostCount((count) => Math.min(count + FEED_PAGE_SIZE, filteredGenerations.length));
            setLoadingMorePosts(false);
            feedPageTimer.current = null;
        }, 250);
    };

    useEffect(
        () => () => {
            if (mascotMessageTimer.current) clearTimeout(mascotMessageTimer.current);
            if (feedPageTimer.current !== null) window.clearTimeout(feedPageTimer.current);
        },
        [],
    );

    const handleMascotClick = () => {
        setMascotMessageIndex((current) =>
            current === null ? 0 : (current + 1) % mascotMessages.length,
        );
        setMascotAnimating(false);
        window.requestAnimationFrame(() => setMascotAnimating(true));
        if (mascotMessageTimer.current) clearTimeout(mascotMessageTimer.current);
        mascotMessageTimer.current = setTimeout(() => {
            setMascotMessageIndex(null);
            setMascotAnimating(false);
            mascotMessageTimer.current = null;
        }, 2500);
    };

    const fetchGenerations = useCallback(async (showLoading = true) => {
        if (feedPageTimer.current !== null) window.clearTimeout(feedPageTimer.current);
        setVisiblePostCount(FEED_PAGE_SIZE);
        setLoadingMorePosts(false);
        if (showLoading) setFeedLoading(true);
        setFeedError(null);
        try {
            const query = supabase
                .from('generations')
                .select('*')
                .order('created_at', { ascending: false });

            const { data, error } = await query;
            if (error) throw error;

            const fetchedPosts = data.map((generation) => toFeedPost(generation));
            const fetchedIds = new Set(fetchedPosts.map((post) => post.id));
            const coffeeCounts: Record<string, number> = {};
            if (fetchedIds.size > 0) {
                for (let offset = 0; ; offset += 1000) {
                    const { data: coffeeVotes, error: coffeeVotesError } = await supabase
                        .from('votes')
                        .select('generation_id')
                        .eq('vote_type', 'coffee')
                        .in('generation_id', [...fetchedIds])
                        .range(offset, offset + 999);
                    if (coffeeVotesError) throw coffeeVotesError;
                    for (const vote of coffeeVotes) {
                        coffeeCounts[vote.generation_id] = (coffeeCounts[vote.generation_id] ?? 0) + 1;
                    }
                    if (coffeeVotes.length < 1000) break;
                }
            }
            setGenerations((previous) => {
                const mergedFetchedPosts = fetchedPosts.map((post) => {
                    const localPost = localPostsRef.current.find((entry) => entry.id === post.id);
                    const previousPost = previous.find((entry) => entry.id === post.id);
                    const imagePost = getUserUploadedImage(localPost ?? {})
                        ? localPost
                        : previousPost;
                    const userImage = getUserUploadedImage(imagePost ?? {});
                    return userImage
                        ? {
                              ...post,
                              userImage,
                              stickerPosition: imagePost?.stickerPosition,
                          }
                        : post;
                });
                const retainedPosts = previous.filter((post) => !fetchedIds.has(post.id));
                return [...mergedFetchedPosts, ...retainedPosts].sort(
                    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
                );
            });
            setReactionCounts(Object.fromEntries(
                data.map((generation) => [
                    generation.id,
                    {
                        hug: generation.hug_count ?? 0,
                        coffee: coffeeCounts[generation.id] ?? 0,
                    },
                ]),
            ));
            const { data: comments, error: commentsError } = await supabase
                .from('feed_comments')
                .select('generation_id');
            if (commentsError) {
                console.error('Comment count fetch error:', commentsError);
            } else {
                const counts = comments.reduce<Record<string, number>>((result, comment) => {
                    result[comment.generation_id] = (result[comment.generation_id] ?? 0) + 1;
                    return result;
                }, {});
                setCommentCounts(counts);
            }
        } catch (error) {
            console.error('Feed fetch error:', error);
            setFeedError('The vent feed could not be loaded. Please try again.');
        } finally {
            setFeedLoading(false);
        }
    }, [supabase]);

    const refreshCoffeeCount = useCallback(async (generationId: string) => {
        const { count, error } = await supabase
            .from('votes')
            .select('generation_id', { count: 'exact', head: true })
            .eq('generation_id', generationId)
            .eq('vote_type', 'coffee');
        if (error) throw error;

        const coffeeCount = count ?? 0;
        setReactionCounts((previous) => ({
            ...previous,
            [generationId]: {
                ...(previous[generationId] ?? { hug: 0, coffee: 0 }),
                coffee: coffeeCount,
            },
        }));
        setGenerations((previous) => previous.map((post) =>
            post.id === generationId ? { ...post, coffee_count: coffeeCount } : post,
        ));
    }, [supabase]);

    const showToast = (message: string) => {
        setToastMessage(message);
        setTimeout(() => setToastMessage(null), 3500);
    };

    useEffect(() => {
        const timer = window.setTimeout(() => {
            try {
                const storedValue = window.localStorage.getItem(LOCAL_POSTS_STORAGE_KEY);
                if (storedValue) {
                    const parsed: unknown = JSON.parse(storedValue);
                    if (!Array.isArray(parsed)) {
                        throw new Error('Saved vent history has an invalid format.');
                    }

                    const savedPosts = parsed.filter(isStoredFeedPost).map((post) => ({
                        ...post,
                        userImage: getUserUploadedImage(post),
                    }));
                    if (savedPosts.length !== parsed.length) {
                        console.error('Some saved vents were skipped because their data was invalid.');
                    }
                    localPostsRef.current = savedPosts;
                    setLocalPosts(savedPosts);
                    setGenerations((previous) => mergeFeedPosts(previous, savedPosts));
                }
            } catch (error) {
                console.error('Could not restore saved vent history:', error);
                showToast('Saved vent history could not be restored. Your server-saved posts are still available.');
            } finally {
                setLocalPostsLoaded(true);
            }
        }, 0);
        return () => window.clearTimeout(timer);
    }, []);

    useEffect(() => {
        if (!localPostsLoaded) return;
        try {
            if (localPosts.length === 0) {
                window.localStorage.removeItem(LOCAL_POSTS_STORAGE_KEY);
                return;
            }
            const postsForStorage = localPosts.map((post) => {
                const storedPost = { ...post };
                delete storedPost.base64Image;
                return storedPost;
            });
            window.localStorage.setItem(LOCAL_POSTS_STORAGE_KEY, JSON.stringify(postsForStorage));
        } catch (error) {
            console.error('Could not persist local vent history:', error);
            window.setTimeout(
                () => showToast('Your post is visible, but browser storage is full. Clear saved local posts to make room.'),
                0,
            );
        }
    }, [localPosts, localPostsLoaded]);

    const clearSavedLocalPosts = () => {
        localPostsRef.current = [];
        setLocalPosts([]);
        setGenerations((previous) =>
            previous.map((post) => ({ ...post, userImage: null, stickerPosition: undefined })),
        );
        setLatestReflection((previous) =>
            previous ? { ...previous, userImage: null, stickerPosition: undefined } : previous,
        );
        showToast('Saved local photos and post copies were cleared. Server posts remain in the feed.');
    };

    useEffect(() => {
        const applyAuthUser = (user: User | null) => {
            setCurrentUser(user);
            if (!user) {
                setLocallyCommentedPosts({});
                return;
            }

            try {
                const storageKey = `meditations-commented-posts:${user.id}`;
                const storedPostIds: unknown = JSON.parse(window.localStorage.getItem(storageKey) ?? '[]');
                if (!Array.isArray(storedPostIds)) {
                    throw new Error('Saved interacted-post state has an invalid format.');
                }
                const postIds = storedPostIds.filter((id): id is string => typeof id === 'string');
                if (postIds.length !== storedPostIds.length) {
                    throw new Error('Saved interacted-post state has an invalid format.');
                }
                setLocallyCommentedPosts(Object.fromEntries(postIds.map((id) => [id, true])));
            } catch (error) {
                console.error('Could not restore replied-to posts:', error);
                setLocallyCommentedPosts({});
            }
        };

        supabase.auth.getUser().then(({ data: { user } }) => {
            applyAuthUser(user);
        });
        const { data: authListener } = supabase.auth.onAuthStateChange((_, session) => {
            applyAuthUser(session?.user ?? null);
        });

        const initialFetchTimeout = setTimeout(() => {
            void fetchGenerations();
        }, 0);

        return () => {
            clearTimeout(initialFetchTimeout);
            authListener.subscription.unsubscribe();
        };
    }, [fetchGenerations, supabase]);

    useEffect(() => {
        if (!currentUser || !generationIdsKey) return;

        let cancelled = false;
        const generationIds = generationIdsKey.split(',');
        void supabase
            .from('votes')
            .select('generation_id, vote_type')
            .eq('user_id', currentUser.id)
            .in('generation_id', generationIds)
            .then(({ data, error }) => {
                if (cancelled) return;
                if (error) {
                    console.error('Could not load reaction state:', error);
                    return;
                }

                const next: Record<string, ReactionState> = {};
                for (const vote of data) {
                    const key = `${currentUser.id}:${vote.generation_id}`;
                    const state = next[key] ?? { hug: false, coffee: false };
                    if (vote.vote_type === 'hug') state.hug = true;
                    if (vote.vote_type === 'coffee') state.coffee = true;
                    next[key] = state;
                }
                setReactions(next);
            });

        return () => {
            cancelled = true;
        };
    }, [currentUser, generationIdsKey, supabase]);

    useEffect(() => {
        if (!currentUser || !ownGenerationIdsKey) return;

        const ownPostIds = new Set(ownGenerationIdsKey.split(','));
        const channel = supabase
            .channel(`coffee-offer-notifications-${currentUser.id}`)
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'feed_comments' },
                (payload) => {
                    const comment = payload.new as {
                        generation_id?: unknown;
                        content?: unknown;
                    };
                    if (
                        typeof comment.generation_id === 'string' &&
                        ownPostIds.has(comment.generation_id) &&
                        typeof comment.content === 'string' &&
                        comment.content.startsWith('☕ Bought you a coffee!')
                    ) {
                        setToastMessage('☕ Someone offered you a coffee on your post.');
                        window.setTimeout(() => setToastMessage(null), 3500);
                    }
                },
            )
            .subscribe((status, error) => {
                if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                    console.error('Coffee offer notifications could not connect:', error ?? status);
                }
            });

        return () => {
            void supabase.removeChannel(channel);
        };
    }, [currentUser, ownGenerationIdsKey, supabase]);

    useEffect(() => {
        if (!generationIdsKey) return;

        const channel = supabase
            .channel('feed-coffee-vote-counts')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'votes', filter: 'vote_type=eq.coffee' },
                (payload) => {
                    const vote = (payload.new ?? payload.old) as {
                        generation_id?: unknown;
                        vote_type?: unknown;
                    };
                    if (
                        typeof vote.generation_id !== 'string' ||
                        vote.vote_type !== 'coffee' ||
                        !generationIdsKey.split(',').includes(vote.generation_id)
                    ) {
                        return;
                    }
                    void refreshCoffeeCount(vote.generation_id).catch((error) => {
                        console.error('Could not refresh coffee reaction count:', error);
                    });
                },
            )
            .subscribe((status, error) => {
                if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                    console.error('Coffee count updates could not connect:', error ?? status);
                }
            });

        return () => {
            void supabase.removeChannel(channel);
        };
    }, [generationIdsKey, refreshCoffeeCount, supabase]);

    useEffect(() => {
        if (latestReflection && !loading) {
            latestReflectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, [latestReflection, loading]);

    const handleVibeImageChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = '';
        if (!file) return;

        const allowedTypes = ['image/jpeg', 'image/png'];
        const hasAllowedExtension = /\.(jpe?g|png)$/i.test(file.name);
        if ((!allowedTypes.includes(file.type) && file.type !== '') || !hasAllowedExtension) {
            setVibeImageError('Choose a JPG or PNG image.');
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            setVibeImageError('Choose an image smaller than 10 MB.');
            return;
        }

        try {
            const imageDataUrl = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onerror = () => reject(new Error('The selected photo could not be read.'));
                reader.onload = () => {
                    const result = reader.result;
                    if (typeof result !== 'string') {
                        reject(new Error('The selected photo could not be read.'));
                        return;
                    }

                    const preview = new Image();
                    preview.onload = () => {
                        const maxDimension = 1600;
                        const scale = Math.min(1, maxDimension / Math.max(preview.naturalWidth, preview.naturalHeight));
                        const canvas = document.createElement('canvas');
                        canvas.width = Math.max(1, Math.round(preview.naturalWidth * scale));
                        canvas.height = Math.max(1, Math.round(preview.naturalHeight * scale));
                        const context = canvas.getContext('2d');
                        if (!context) {
                            reject(new Error('Your photo could not be prepared for saving.'));
                            return;
                        }
                        context.fillStyle = '#ffffff';
                        context.fillRect(0, 0, canvas.width, canvas.height);
                        context.drawImage(preview, 0, 0, canvas.width, canvas.height);
                        resolve(canvas.toDataURL('image/jpeg', 0.82));
                    };
                    preview.onerror = () => reject(new Error('That file is not a valid image.'));
                    preview.src = result;
                };
                reader.readAsDataURL(file);
            });
            setVibeImage(imageDataUrl);
            setVibeImageName(file.name);
            setVibeImageError(null);
            setStickerPosition({ x: 50, y: 58, scale: 1, rotation: 0 });
        } catch (error) {
            console.error('Could not load the selected photo:', error);
            setVibeImageError(error instanceof Error ? error.message : 'The selected photo could not be loaded.');
        }
    };

    const handleStickerPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
        const frame = event.currentTarget.parentElement;
        if (!frame) return;
        const bounds = frame.getBoundingClientRect();
        event.currentTarget.setPointerCapture(event.pointerId);
        stickerDragStart.current = {
            pointerId: event.pointerId,
            clientX: event.clientX,
            clientY: event.clientY,
            x: stickerPosition.x,
            y: stickerPosition.y,
            width: bounds.width,
            height: bounds.height,
        };
        event.preventDefault();
    };

    const handleStickerPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
        const start = stickerDragStart.current;
        if (!start || start.pointerId !== event.pointerId) return;
        const stickerWidth = 26 * stickerPosition.scale;
        const stickerHeight = stickerWidth * (start.width / start.height);
        setStickerPosition((position) => ({
            ...position,
            x: Math.max(stickerWidth / 2, Math.min(100 - stickerWidth / 2, start.x + ((event.clientX - start.clientX) / start.width) * 100)),
            y: Math.max(stickerHeight / 2, Math.min(100 - stickerHeight / 2, start.y + ((event.clientY - start.clientY) / start.height) * 100)),
        }));
    };

    const handleStickerPointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
        if (stickerDragStart.current?.pointerId !== event.pointerId) return;
        stickerDragStart.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
    };

    const generationCardContent = (generationId: string, type: ReactionType) => {
        const stateKey = `${currentUser?.id ?? 'anonymous'}:${generationId}`;
        return reactions[stateKey]?.[type] ?? false;
    };

    const handleGenerate = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (generationInProgress.current) return;
        if (!prompt.trim() || !time || !location.trim() || location.trim().length < 2) return;

        if (!currentUser) {
            showToast('Please sign in to generate a reflection.');
            return;
        }

        generationInProgress.current = true;
        setIsGenerating(true);
        setGenerationError(null);
        const uploadedImage = vibeImage;
        const uploadedStickerPosition = uploadedImage ? { ...stickerPosition } : undefined;
        setLoading(true);
        setLatestReflection(null);
        const minimumLoadingTime = new Promise<void>((resolve) => {
            window.setTimeout(resolve, 3800);
        });
        try {
            const response = await fetch('/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt,
                    location: `${time} at ${location.trim()}`,
                    stress_level: Number(stressLevel),
                    tone,
                    userImage: uploadedImage,
                    stickerPosition: uploadedStickerPosition,
                }),
            });

            if (!response.ok) {
                const errorData: { error?: string } = await response.json();
                throw new Error(errorData.error || 'Failed to generate a reflection.');
            }

            const generated: Generation = await response.json();
            const normalizedPost = toFeedPost(generated, Date.now());
            const generatedImage = generated.base64Image || generated.imageUrl;
            let imageUrl: string;
            let imageFallback = generated.image_fallback === true;
            if (!generatedImage?.startsWith('data:image/')) {
                imageUrl = createPlaceholderImageDataUrl();
                imageFallback = true;
            } else {
                try {
                    imageUrl = await preloadImage(generatedImage);
                } catch (error) {
                    console.warn('Generated illustration could not be loaded; using a placeholder.', error);
                    imageUrl = createPlaceholderImageDataUrl();
                    imageFallback = true;
                }
            }
            await minimumLoadingTime;
            const newPost: FeedPost = {
                ...normalizedPost,
                imageUrl,
                base64Image: imageUrl,
                imagePreloaded: true,
                userImage: uploadedImage,
                stickerPosition: uploadedStickerPosition,
            };
            setLatestReflection({
                ...generated,
                imageUrl: newPost.imageUrl,
                image_url: newPost.imageUrl,
                base64Image: imageUrl,
                image_prompt: newPost.imagePrompt,
                image_fallback: imageFallback,
                imagePreloaded: true,
                userImage: uploadedImage,
                stickerPosition: uploadedStickerPosition,
            });
            localPostsRef.current = [
                newPost,
                ...localPostsRef.current.filter((post) => post.id !== newPost.id),
            ];
            setLocalPosts(localPostsRef.current);
            setGenerations((previous) => {
                const next = [newPost, ...previous.filter((post) => post.id !== generated.id)];
                return feedSort === 'latest'
                    ? next
                    : next.sort((a, b) =>
                          (b.stress_level ?? 0) - (a.stress_level ?? 0) ||
                          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
                      );
            });
            setPrompt('');
            setTime('');
            setLocation('');
            if (imageFallback) {
                showToast("Your reflection is ready, but its illustration is unavailable. We've shown a calm placeholder instead.");
            }
        } catch (error) {
            console.error('Reflection generation failed:', error);
            const message = error instanceof Error
                ? error.message
                : 'We could not create your reflection just now. Please try again shortly.';
            setGenerationError(message);
            showToast(message);
        } finally {
            await minimumLoadingTime;
            setLoading(false);
            setIsGenerating(false);
            generationInProgress.current = false;
        }
    };

    const handleDownloadCard = async (
        generationId: string,
        cardElementId = `journal-card-${generationId}`,
    ) => {
        const exportCard = document.getElementById(`polaroid-export-${cardElementId}`);
        if (!exportCard) {
            console.error(`Could not export Polaroid for ${generationId}: export element was not found.`);
            showToast('Could not find the Polaroid export card.');
            return;
        }

        setDownloadingCard(generationId);
        try {
            const images = Array.from(exportCard.querySelectorAll('img'));
            await Promise.all(images.map(async (image) => {
                image.loading = 'eager';
                if (!image.complete) {
                    await new Promise<void>((resolve, reject) => {
                        const timeout = window.setTimeout(
                            () => reject(new Error('A Polaroid image did not finish loading in time.')),
                            30_000,
                        );
                        image.addEventListener('load', () => {
                            window.clearTimeout(timeout);
                            resolve();
                        }, { once: true });
                        image.addEventListener('error', () => {
                            window.clearTimeout(timeout);
                            reject(new Error('A Polaroid image could not be loaded; it may be blocked by cross-origin image permissions.'));
                        }, { once: true });
                    });
                }
                try {
                    await image.decode();
                } catch (error) {
                    if (image.naturalWidth === 0 || image.naturalHeight === 0) {
                        throw new Error(
                            'A Polaroid image could not be decoded; it may be blocked by cross-origin image permissions.',
                            { cause: error },
                        );
                    }
                    throw error;
                }
                if (image.naturalWidth === 0 || image.naturalHeight === 0) {
                    throw new Error('A Polaroid image did not finish loading; it may be blocked by cross-origin image permissions.');
                }
            }));
            await document.fonts.ready;
            await new Promise<void>((resolve) => window.setTimeout(resolve, 500));

            const computedStyle = window.getComputedStyle(exportCard);
            const bounds = exportCard.getBoundingClientRect();
            if (
                computedStyle.display === 'none' ||
                computedStyle.visibility === 'hidden' ||
                bounds.width < 1 ||
                exportCard.scrollHeight < 1
            ) {
                throw new Error('The Polaroid export card is not ready to capture.');
            }

            const captureOptions = {
                backgroundColor: '#FDFAF6',
                pixelRatio: 2,
                width: 1200,
                height: exportCard.scrollHeight,
                filter: (node: HTMLElement) => !(
                    node instanceof HTMLElement &&
                    node.dataset.exportIgnore !== undefined
                ),
                style: {
                    position: 'fixed',
                    left: '0',
                    top: '0',
                    zIndex: '1000',
                    transform: 'none',
                    pointerEvents: 'auto',
                },
            };
            let imageDataUrl: string;
            try {
                imageDataUrl = await toPng(exportCard, {
                    ...captureOptions,
                    cacheBust: true,
                });
            } catch (primaryError) {
                console.warn(
                    `Polaroid export with cache busting failed for ${generationId}; retrying without reloading images.`,
                    primaryError,
                );
                imageDataUrl = await toPng(exportCard, {
                    ...captureOptions,
                    cacheBust: false,
                });
            }
            if (!imageDataUrl.startsWith('data:image/png;base64,') || imageDataUrl.length < 1_000) {
                throw new Error('The Polaroid image export was empty.');
            }
            const downloadLink = document.createElement('a');
            downloadLink.download = `polaroid-${generationId}.png`;
            downloadLink.href = imageDataUrl;
            downloadLink.click();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`Could not export Polaroid for ${generationId}: ${errorMessage}`, error);
            const isImagePermissionError = /cross[- ]origin|cors|taint|securityerror|failed to fetch/i.test(errorMessage);
            showToast(isImagePermissionError
                ? 'Could not export this image because its source blocks cross-origin access. Try re-uploading the photo or choosing a different image.'
                : `Could not download the Polaroid: ${errorMessage}`);
        } finally {
            setDownloadingCard(null);
        }
    };

    const handleReaction = async (
        generationId: string,
        type: ReactionType,
        currentStateOverride?: boolean,
    ): Promise<boolean> => {
        if (!currentUser) {
            showToast('Please sign in to send a little support.');
            return false;
        }

        const stateKey = `${currentUser.id}:${generationId}`;
        const pendingKey = `${stateKey}:${type}`;
        if (reactionLocks.current.has(pendingKey)) return false;

        const wasActive = currentStateOverride ?? reactions[stateKey]?.[type] ?? false;
        const delta = wasActive ? -1 : 1;
        const generation = generations.find((post) => post.id === generationId);
        const baseCount = reactionCounts[generationId]?.[type] ?? generation?.[`${type}_count`] ?? 0;
        const updateCount = (amount: number) => {
            setReactionCounts((previous) => {
                const current = previous[generationId] ?? {
                    hug: generation?.hug_count ?? 0,
                    coffee: generation?.coffee_count ?? 0,
                };
                return {
                    ...previous,
                    [generationId]: {
                        ...current,
                        [type]: Math.max(0, current[type] + amount),
                    },
                };
            });
        };

        reactionLocks.current.add(pendingKey);
        setPendingReactions((previous) => ({ ...previous, [pendingKey]: true }));
        setReactions((previous) => ({
            ...previous,
            [stateKey]: {
                hug: previous[stateKey]?.hug ?? false,
                coffee: previous[stateKey]?.coffee ?? false,
                [type]: !wasActive,
            },
        }));
        updateCount(delta);

        try {
            const result = await castVote(generationId, type);
            if (result.error) {
                const error = new Error(result.error.message);
                Object.assign(error, result.error);
                throw error;
            }
            const confirmedDelta = result.action === 'added' ? 1 : -1;
            const confirmedCount = Math.max(0, baseCount + confirmedDelta);
            setReactionCounts((previous) => ({
                ...previous,
                [generationId]: {
                    ...(previous[generationId] ?? { hug: 0, coffee: 0 }),
                    [type]: confirmedCount,
                },
            }));
            if (type === 'coffee') {
                setGenerations((previous) => previous.map((post) =>
                    post.id === generationId ? { ...post, coffee_count: confirmedCount } : post,
                ));
            }
            return true;
        } catch (error) {
            console.error('Detailed reaction error:', error);
            setReactions((previous) => ({
                ...previous,
                [stateKey]: {
                    hug: previous[stateKey]?.hug ?? false,
                    coffee: previous[stateKey]?.coffee ?? false,
                    [type]: wasActive,
                },
            }));
            updateCount(-delta);
            showToast('Your reaction could not be saved. Please try again.');
            return false;
        } finally {
            reactionLocks.current.delete(pendingKey);
            setPendingReactions((previous) => {
                const next = { ...previous };
                delete next[pendingKey];
                return next;
            });
        }
    };

    const toggleComments = async (generationId: string) => {
        const opening = !openComments[generationId];
        setOpenComments((previous) => ({ ...previous, [generationId]: opening }));
        if (!opening || commentsByGeneration[generationId]) return;

        setCommentsLoading((previous) => ({ ...previous, [generationId]: true }));
        try {
            const { data, error } = await supabase
                .from('feed_comments')
                .select('id, generation_id, content, created_at, author_name, user_id')
                .eq('generation_id', generationId)
                .order('created_at', { ascending: true });
            if (error) throw error;

            setCommentsByGeneration((previous) => ({ ...previous, [generationId]: data }));
            setCommentCounts((previous) => ({ ...previous, [generationId]: data.length }));
        } catch (error) {
            console.error('Could not load feed comments:', error);
            showToast('Comments could not be loaded. Please close and reopen them to retry.');
            setOpenComments((previous) => ({ ...previous, [generationId]: false }));
        } finally {
            setCommentsLoading((previous) => ({ ...previous, [generationId]: false }));
        }
    };

    const handlePostComment = async (targetId: string, commentText: string): Promise<boolean> => {
        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!targetId || !uuidPattern.test(targetId)) {
            console.error('Cannot post comment: generation_id is missing or is not a valid UUID.', targetId);
            alert('This reflection is not ready for comments yet. Please refresh and try again.');
            return false;
        }

        const content = commentText.trim();
        if (!content) return false;
        if (!currentUser) {
            showToast('Please sign in to post a comment.');
            return false;
        }

        setCommentPosting((previous) => ({ ...previous, [targetId]: true }));
        const optimisticComment: FeedComment = {
            id: `optimistic-${crypto.randomUUID()}`,
            generation_id: targetId,
            content,
            created_at: new Date().toISOString(),
            author_name: 'Anonymous Morningsider',
        };
        setCommentsByGeneration((previous) => ({
            ...previous,
            [targetId]: [...(previous[targetId] ?? []), optimisticComment],
        }));
        setCommentCounts((previous) => ({
            ...previous,
            [targetId]: (previous[targetId] ?? 0) + 1,
        }));
        setCommentDrafts((previous) => ({ ...previous, [targetId]: '' }));

        try {
            const result = await postFeedComment(targetId, content);
            if (!result.success) throw new Error(result.error.message);
            const insertedComment = result.comment as FeedComment;

            setCommentsByGeneration((previous) => ({
                ...previous,
                [targetId]: (previous[targetId] ?? []).map((comment) =>
                    comment.id === optimisticComment.id ? insertedComment : comment,
                ),
            }));
            setLocallyCommentedPosts((previous) => ({ ...previous, [targetId]: true }));
            try {
                const storageKey = `meditations-commented-posts:${currentUser.id}`;
                const savedPostIds: unknown = JSON.parse(window.localStorage.getItem(storageKey) ?? '[]');
                if (!Array.isArray(savedPostIds) || !savedPostIds.every((id) => typeof id === 'string')) {
                    throw new Error('Saved interacted-post state has an invalid format.');
                }
                window.localStorage.setItem(storageKey, JSON.stringify([...new Set([...savedPostIds, targetId])]));
            } catch (error) {
                console.error('Could not persist replied-to post state:', error);
            }
            return true;
        } catch (error) {
            console.error('Failed to post comment:', error);
            setCommentsByGeneration((previous) => ({
                ...previous,
                [targetId]: (previous[targetId] ?? []).filter(
                    (comment) => comment.id !== optimisticComment.id,
                ),
            }));
            setCommentCounts((previous) => ({
                ...previous,
                [targetId]: Math.max(0, (previous[targetId] ?? 1) - 1),
            }));
            setCommentDrafts((previous) => ({ ...previous, [targetId]: content }));
            const message = error instanceof Error ? error.message : 'Your comment could not be posted.';
            showToast(message);
            alert(message);
            return false;
        } finally {
            setCommentPosting((previous) => ({ ...previous, [targetId]: false }));
        }
    };

    const handleCoffeeOfferSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const generationId = coffeeOfferGenerationId;
        const handle = coffeeSocialHandle.trim();
        if (!generationId || !handle) {
            setCoffeeOfferError('Please enter your social handle before sending the coffee offer.');
            return;
        }
        if (!currentUser) {
            setCoffeeOfferError('Please sign in before sending a coffee offer.');
            return;
        }

        setCoffeeOfferSubmitting(true);
        setCoffeeOfferError(null);
        const stateKey = `${currentUser.id}:${generationId}`;
        const alreadyCoffeeReacted = reactions[stateKey]?.coffee ?? false;
        let addedCoffeeReaction = false;

        try {
            if (!alreadyCoffeeReacted) {
                addedCoffeeReaction = await handleReaction(generationId, 'coffee');
                if (!addedCoffeeReaction) return;
            }

            const posted = await handlePostComment(
                generationId,
                `☕ Bought you a coffee! Reach me on ${coffeeSocialPlatform}: ${handle}`,
            );
            if (!posted) {
                if (addedCoffeeReaction) {
                    await handleReaction(generationId, 'coffee', true);
                }
                setCoffeeOfferError('The coffee offer could not be posted. Please try again.');
                return;
            }

            await fetchGenerations(false);
            try {
                await refreshCoffeeCount(generationId);
            } catch (error) {
                console.error('Coffee offer succeeded, but its database count could not be refreshed:', error);
                showToast('Coffee offer sent, but the latest count could not be loaded. Refresh the feed to retry.');
            }
            setOpenComments((previous) => ({ ...previous, [generationId]: true }));
            setCoffeeOfferGenerationId(null);
            setCoffeeSocialHandle('');
            setCoffeeOfferError(null);
        } catch (error) {
            console.error('Could not complete the coffee offer:', error);
            setCoffeeOfferError('The coffee offer could not be completed. Please try again.');
        } finally {
            setCoffeeOfferSubmitting(false);
        }
    };

    const handleCancelCoffee = async (generationId: string) => {
        if (!currentUser) {
            showToast('Please sign in to cancel your coffee offer.');
            return;
        }
        if (!window.confirm('Cancel your coffee offer? This will remove your coffee reaction and offer comment.')) {
            return;
        }

        setPendingReactions((previous) => ({
            ...previous,
            [`${currentUser.id}:${generationId}:coffee`]: true,
        }));
        try {
            const { data: comment, error: commentError } = await supabase
                .from('feed_comments')
                .select('id')
                .eq('generation_id', generationId)
                .eq('user_id', currentUser.id)
                .like('content', '☕ Bought you a coffee!%')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            if (commentError) throw commentError;
            if (!comment) {
                throw new Error('Your coffee offer comment could not be found. Only offers created with this account can be cancelled.');
            }

            const result = await cancelCoffeeOffer(generationId, comment.id);
            if (!result.success) {
                throw new Error(result.error.message);
            }

            const stateKey = `${currentUser.id}:${generationId}`;
            setReactions((previous) => ({
                ...previous,
                [stateKey]: { ...previous[stateKey], coffee: false },
            }));
            setCommentsByGeneration((previous) => ({
                ...previous,
                [generationId]: (previous[generationId] ?? []).filter(
                    (entry) => entry.id !== comment.id,
                ),
            }));
            setCommentCounts((previous) => ({
                ...previous,
                [generationId]: Math.max(0, (previous[generationId] ?? 1) - 1),
            }));
            try {
                await refreshCoffeeCount(generationId);
            } catch (error) {
                console.error('Coffee offer was cancelled, but its count could not be refreshed:', error);
                showToast('Coffee offer cancelled, but the latest count could not be loaded. Refresh the feed to retry.');
            }
        } catch (error) {
            console.error('Could not cancel coffee offer:', error);
            showToast(error instanceof Error ? error.message : 'Could not cancel your coffee offer.');
        } finally {
            setPendingReactions((previous) => {
                const next = { ...previous };
                delete next[`${currentUser.id}:${generationId}:coffee`];
                return next;
            });
        }
    };

    const renderCommentsSection = (generationId: string) => (
        <section className="mt-4 border-t border-stone-100 pt-4 dark:border-stone-800" aria-label="Comments">
            <button
                type="button"
                onClick={() => void toggleComments(generationId)}
                aria-expanded={openComments[generationId] ?? false}
                className="text-sm font-semibold text-stone-700 hover:text-stone-950 dark:text-stone-300 dark:hover:text-white"
            >
                💬 Comments ({commentCounts[generationId] ?? 0})
            </button>
            {openComments[generationId] && (
                <div className="mt-4">
                    {commentsLoading[generationId] ? (
                        <div className="space-y-3" aria-label="Loading comments">
                            {[0, 1].map((skeleton) => (
                                <div key={skeleton} className="animate-pulse">
                                    <div className="mb-2 h-3 w-28 rounded bg-stone-200 dark:bg-stone-700" />
                                    <div className="h-4 w-3/4 rounded bg-stone-200 dark:bg-stone-700" />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {(commentsByGeneration[generationId] ?? []).map((comment) => (
                                <div key={comment.id} className="rounded-xl bg-stone-50 px-4 py-3 dark:bg-stone-950">
                                    <div className="mb-1 flex items-center justify-between gap-3">
                                        <span className="text-xs font-semibold text-stone-700 dark:text-stone-300">
                                            {comment.author_name || 'Anonymous Morningsider'}
                                        </span>
                                        <time dateTime={comment.created_at} className="text-xs text-stone-500 dark:text-stone-400">
                                            {relativeTime(comment.created_at)}
                                        </time>
                                    </div>
                                    <p className="text-sm text-stone-700 dark:text-stone-200">{comment.content}</p>
                                </div>
                            ))}
                            {commentsByGeneration[generationId]?.length === 0 && (
                                <p className="text-sm text-stone-500 dark:text-stone-400">
                                    No comments yet. Be the first to leave a kind word.
                                </p>
                            )}
                        </div>
                    )}
                    <form
                        className="mt-4 flex gap-2"
                        onSubmit={(event) => {
                            event.preventDefault();
                            void handlePostComment(generationId, commentDrafts[generationId] ?? '');
                        }}
                    >
                        <input
                            value={commentDrafts[generationId] ?? ''}
                            onChange={(event) =>
                                setCommentDrafts((previous) => ({
                                    ...previous,
                                    [generationId]: event.target.value,
                                }))
                            }
                            maxLength={500}
                            placeholder="Leave a kind word or advice..."
                            aria-label="Leave a kind word or advice"
                            className="min-w-0 flex-1 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-600 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
                        />
                        <button
                            type="submit"
                            disabled={commentPosting[generationId] || !(commentDrafts[generationId] ?? '').trim()}
                            className="rounded-xl bg-stone-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-stone-200 dark:text-stone-900"
                        >
                            {commentPosting[generationId] ? 'Posting...' : 'Post'}
                        </button>
                    </form>
                </div>
            )}
        </section>
    );

    return (
        <main className="min-h-screen bg-gradient-to-b from-[#F2F7F4] via-[#EEF5F1] to-[#E5EFE9] px-4 py-10 text-[#2D3748] sm:px-6 lg:px-8 dark:from-[#101a14] dark:via-[#0d1711] dark:to-[#0a120d] dark:text-stone-100">
            {toastMessage && (
                <div
                    className="fixed left-1/2 top-5 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-rose-400 bg-rose-600 px-6 py-3 text-white shadow-2xl"
                    role="status"
                >
                    <span className="text-xl" aria-hidden="true">⚠️</span>
                    <span className="text-sm font-semibold">{toastMessage}</span>
                </div>
            )}
            {coffeeOfferGenerationId && (
                <div
                    className="fixed inset-0 z-[60] flex items-center justify-center bg-stone-950/55 p-4 backdrop-blur-sm"
                    onClick={(event) => {
                        if (event.target === event.currentTarget && !coffeeOfferSubmitting) {
                            setCoffeeOfferGenerationId(null);
                            setCoffeeOfferError(null);
                        }
                    }}
                >
                    <section
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="coffee-offer-title"
                        className="w-full max-w-md rounded-3xl border border-[#E8E1D8] bg-[#FDFAF6] p-6 text-stone-800 shadow-2xl dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
                    >
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h2 id="coffee-offer-title" className="font-serif text-2xl font-semibold">
                                    Send a coffee their way ☕
                                </h2>
                                <p className="mt-2 text-sm leading-relaxed text-stone-600 dark:text-stone-300">
                                    Share where the post author can reach you. We’ll add your offer as a comment on their post.
                                </p>
                            </div>
                            <button
                                type="button"
                                aria-label="Close coffee offer"
                                disabled={coffeeOfferSubmitting}
                                onClick={() => {
                                    setCoffeeOfferGenerationId(null);
                                    setCoffeeOfferError(null);
                                }}
                                className="rounded-full px-2 py-1 text-xl leading-none text-stone-500 hover:bg-stone-100 disabled:opacity-50 dark:hover:bg-stone-800"
                            >
                                ×
                            </button>
                        </div>
                        <form className="mt-5 space-y-4" onSubmit={(event) => void handleCoffeeOfferSubmit(event)}>
                            <label className="block">
                                <span className="mb-1.5 block text-sm font-semibold">Social platform</span>
                                <select
                                    value={coffeeSocialPlatform}
                                    onChange={(event) => setCoffeeSocialPlatform(event.target.value as SocialPlatform)}
                                    className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 dark:border-stone-700 dark:bg-stone-950"
                                >
                                    <option>WeChat</option>
                                    <option>Instagram</option>
                                    <option>LinkedIn</option>
                                    <option>Facebook</option>
                                </select>
                            </label>
                            <label className="block">
                                <span className="mb-1.5 block text-sm font-semibold">Your handle or account</span>
                                <input
                                    autoFocus
                                    value={coffeeSocialHandle}
                                    onChange={(event) => {
                                        setCoffeeSocialHandle(event.target.value);
                                        if (coffeeOfferError) setCoffeeOfferError(null);
                                    }}
                                    maxLength={100}
                                    required
                                    placeholder="@yourhandle"
                                    className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-600 dark:border-stone-700 dark:bg-stone-950"
                                />
                            </label>
                            {coffeeOfferError && (
                                <p role="alert" className="text-sm font-medium text-rose-700 dark:text-rose-300">
                                    {coffeeOfferError}
                                </p>
                            )}
                            <div className="flex justify-end gap-3 pt-1">
                                <button
                                    type="button"
                                    disabled={coffeeOfferSubmitting}
                                    onClick={() => {
                                        setCoffeeOfferGenerationId(null);
                                        setCoffeeOfferError(null);
                                    }}
                                    className="rounded-xl border border-stone-300 px-4 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-100 disabled:opacity-50 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-800"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={coffeeOfferSubmitting || !coffeeSocialHandle.trim()}
                                    className="rounded-xl bg-amber-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-900 disabled:cursor-wait disabled:opacity-60"
                                >
                                    {coffeeOfferSubmitting ? 'Sending…' : 'Send coffee offer'}
                                </button>
                            </div>
                        </form>
                    </section>
                </div>
            )}

            <header className="mx-auto mb-10 flex max-w-3xl flex-wrap items-center justify-between gap-4 border-b border-[#DCE9E0] pb-5 dark:border-stone-800">
                <div>
                    <h1 className="font-serif text-3xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">
                        Meditations.cc
                    </h1>
                    <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
                        Stoic Clarity for Morningside Chaos
                    </p>
                </div>
                <div>
                    {currentUser ? (
                        <div className="flex items-center gap-3">
                            <span className="text-sm text-stone-600 dark:text-stone-400">
                                {currentUser.email}
                            </span>
                            {currentUser.email === 'fx2216@columbia.edu' && (
                                <Link
                                    href="/admin"
                                    className="rounded-lg bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-800 transition-colors hover:bg-emerald-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
                                >
                                    Admin Panel
                                </Link>
                            )}
                            <SignOutButton />
                        </div>
                    ) : (
                        <GoogleSignInButton />
                    )}
                </div>
            </header>

            <section className="mx-auto mb-10 max-w-3xl">
                <div className="mb-7 px-1 text-center sm:mb-9">
                    <h2 className="mx-auto max-w-3xl font-serif text-3xl font-semibold leading-[1.15] tracking-tight text-stone-900 sm:text-4xl dark:text-stone-100">
                        <span className="block">Unload your instant stress.</span>
                        <span className="block">Walk away with your custom relief.</span>
                    </h2>
                    <p className="mx-auto mt-3 max-w-none text-sm leading-relaxed text-gray-500 md:whitespace-nowrap md:text-base dark:text-stone-300">
                        Share what&apos;s on your mind—get instant, perspective-shifting relief tailored to this exact moment.
                    </p>
                </div>
                <form
                    onSubmit={handleGenerate}
                    className="rounded-3xl border border-[#E0EBE3] bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900"
                >
                    <div className="grid gap-5">
                        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:items-stretch md:gap-8">
                        <div className="contents">
                            <div className="flex min-w-0 flex-col justify-start gap-5">
                                <div className="min-w-0">
                                    <label
                                        htmlFor="reflection-time"
                                        className="mb-2 block text-sm font-semibold text-[#2D3748] dark:text-stone-200"
                                    >
                                        Time
                                    </label>
                                    <div className="relative">
                                        <input
                                            id="reflection-time"
                                            type="text"
                                            list="reflection-time-options"
                                            value={time}
                                            onChange={(event) => setTime(event.target.value)}
                                            placeholder="e.g. 11:45 PM"
                                            className="h-11 w-full rounded-xl border border-[#DCE8DF] bg-[#F8FBF9] px-3 pr-9 text-sm text-[#2D3748] placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#5F937B] dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100 dark:placeholder:text-stone-500 dark:focus:ring-emerald-400"
                                            disabled={loading}
                                            required
                                        />
                                        <datalist id="reflection-time-options">
                                            <option value="08:30 Morning Rush" />
                                            <option value="14:00 Afternoon" />
                                            <option value="23:00 Late Night" />
                                        </datalist>
                                        <svg
                                            aria-hidden="true"
                                            viewBox="0 0 20 20"
                                            className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[#5F937B]"
                                            fill="none"
                                        >
                                            <path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                    </div>
                                </div>
                                <div className="min-w-0">
                                    <label
                                        htmlFor="reflection-location"
                                        className="mb-2 block text-sm font-semibold text-[#2D3748] dark:text-stone-200"
                                    >
                                        Location
                                    </label>
                                    <div className="relative">
                                        <input
                                            id="reflection-location"
                                            type="text"
                                            list="reflection-location-options"
                                            value={location}
                                            onChange={(event) => setLocation(event.target.value)}
                                            placeholder="Where are you?"
                                            minLength={2}
                                            className="h-11 w-full rounded-xl border border-[#DCE8DF] bg-[#F8FBF9] px-3 pr-9 text-sm text-[#2D3748] placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#5F937B] dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100 dark:placeholder:text-stone-500 dark:focus:ring-emerald-400"
                                            disabled={loading}
                                            required
                                        />
                                        <datalist id="reflection-location-options">
                                            <option value="Butler Library" />
                                            <option value="Dorm / Room" />
                                            <option value="1 Train / Commute" />
                                            <option value="Coffee Shop" />
                                        </datalist>
                                        <svg
                                            aria-hidden="true"
                                            viewBox="0 0 20 20"
                                            className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[#5F937B]"
                                            fill="none"
                                        >
                                            <path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                    </div>
                                </div>
                            </div>
                            <div className="order-3 flex min-w-0 flex-col items-center justify-center gap-2 md:row-span-2 md:order-none md:self-center">
                                <div className="relative z-10 shrink-0">
                                    {mascotMessageIndex !== null && (
                                        <div
                                            key={mascotMessageIndex}
                                            role="status"
                                            className="absolute bottom-full left-1/2 z-20 mb-2 w-max max-w-48 -translate-x-1/2 rounded-2xl border border-emerald-100 bg-white px-3 py-2 text-center text-xs font-medium leading-relaxed text-[#365B48] shadow-lg animate-[bubble-fade_2.5s_ease-in-out_forwards] dark:border-stone-700 dark:bg-stone-900 dark:text-emerald-100"
                                        >
                                            {mascotMessages[mascotMessageIndex]}
                                            <span className="absolute left-1/2 top-full -translate-x-1/2 border-x-[7px] border-t-[7px] border-x-transparent border-t-white dark:border-t-stone-900" />
                                        </div>
                                    )}
                                    <button
                                        type="button"
                                        onClick={handleMascotClick}
                                        aria-label="Get a comforting message from the mascot"
                                        className="group animate-[float_4s_ease-in-out_infinite] cursor-pointer border-0 bg-transparent p-0 transition-transform duration-300 hover:scale-105 active:scale-95 focus:outline-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-transparent"
                                    >
                                        <svg
                                            viewBox="0 0 200 200"
                                            width="320"
                                            height="320"
                                            aria-hidden="true"
                                            className={`h-auto w-[320px] max-w-[90vw] transition-transform duration-300 group-hover:scale-105 ${mascotAnimating ? 'animate-[mascot-bounce_500ms_ease-out]' : ''}`}
                                        >
                                            <defs>
                                                <radialGradient id="zen-halo" cx="50%" cy="46%" r="58%">
                                                    <stop offset="0%" stopColor="#FEF3C7" stopOpacity=".56" />
                                                    <stop offset="58%" stopColor="#FDE68A" stopOpacity=".22" />
                                                    <stop offset="100%" stopColor="#FFF3B0" stopOpacity="0" />
                                                </radialGradient>
                                                <linearGradient id="zen-lotus-throne" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0%" stopColor="#FFB6C1" />
                                                    <stop offset="100%" stopColor="#FF8FAB" />
                                                </linearGradient>
                                            </defs>
                                            <g strokeLinecap="round" strokeLinejoin="round">
                                                <ellipse cx="100" cy="96" rx="91" ry="89" fill="url(#zen-halo)" />
                                                <path d="M30 61c-1-7 7-12 13-8 5 3 5 9 1 12l-1 6-6-4c-4 0-7-2-7-6Zm127-9c6-4 14 1 13 8 0 4-3 6-7 6l-6 4-1-6c-4-3-4-9 1-12ZM22 124c-1-6 6-10 11-7 4 3 4 7 1 10l-1 5-5-3c-3 0-6-2-6-5Zm134 3c-3-3-3-7 1-10 5-3 12 1 11 7 0 3-3 5-6 5l-5 3-1-5Z" fill="#FFB4C2" opacity=".88" />
                                                <path d="M34 59q5-5 9 0-1 5-5 7-4-2-4-7Zm126 0q-5-5-9 0 1 5 5 7 4-2 4-7Zm-132 65q4-4 8 0-1 4-4 5-4-1-4-5Zm132 0q-4-4-8 0 1 4 4 5 4-1 4-5Z" fill="#FFCCD5" />

                                                <path d="M25 181c18-24 42-26 75-8-23-2-43 5-60 18 24-8 45-5 60 3 15-8 36-11 60-3-17-13-37-20-60-18 33-18 57-16 75 8-22 12-50 14-75 6-25 8-53 6-75-6Z" fill="#A8D5BA" />
                                                <path d="M32 173c5-24 23-38 43-39-4 19 4 34 25 47 21-13 29-28 25-47 20 1 38 15 43 39-27 18-109 18-136 0Z" fill="url(#zen-lotus-throne)" />
                                                <path d="M100 187c-28-17-41-37-26-56 14 7 23 24 26 49 3-25 12-42 26-49 15 19 2 39-26 56Z" fill="#FFB6C1" />
                                                <path d="M43 170c13-19 30-27 49-22-6 17-22 27-49 22Zm114 0c-13-19-30-27-49-22 6 17 22 27 49 22Z" fill="#FF8FAB" />
                                                <path d="M53 162c15-10 28-10 40 0m14 0c12-10 25-10 40 0" fill="none" stroke="#FFE5EB" strokeWidth="3" />

                                                <path d="M66 142c0-18 14-29 34-29s34 11 34 29v16c0 10-14 16-34 16s-34-6-34-16Z" fill="#9BDDFF" stroke="#75AADB" strokeWidth="2" />
                                                <path d="M78 125c4 8 11 13 22 15 11-2 18-7 22-15l7 6c-4 11-14 18-29 19-15-1-25-8-29-19Z" fill="#FFFFFF" />
                                                <path d="M78 143c-15-7-29-3-33 8-4 10 3 19 14 19 8 0 17-5 25-12m38-15c15-7 29-3 33 8 4 10-3 19-14 19-8 0-17-5-25-12" fill="none" stroke="#75AADB" strokeWidth="16" />
                                                <path d="M62 151c-8-6-17-2-17 6 0 7 7 11 13 7m80-13c8-6 17-2 17 6 0 7-7 11-13 7" fill="none" stroke="#FFF5E6" strokeWidth="9" />
                                                <circle cx="58" cy="158" r="3" fill="#8B5A36" />
                                                <circle cx="142" cy="158" r="3" fill="#8B5A36" />
                                                <path d="M82 148c6-8 13-10 18-4 5-6 12-4 18 4-1 12-7 18-18 18s-17-6-18-18Z" fill="#FFF5E6" stroke="#E6CDA5" strokeWidth="2" />
                                                <path d="M100 147c-6-7-15-4-15 4 0 6 6 10 15 15 9-5 15-9 15-15 0-8-9-11-15-4Z" fill="#FFF5E6" stroke="#E6CDA5" strokeWidth="2" />
                                                <path d="M100 151v9m-5-6q5 3 10 0" fill="none" stroke="#8B5A36" strokeWidth="1.5" />

                                                <circle cx="100" cy="76" r="53" fill="#E8B468" />
                                                <circle cx="100" cy="31" r="23" fill="#E8B468" />
                                                <circle cx="123" cy="37" r="23" fill="#E8B468" />
                                                <circle cx="139" cy="54" r="23" fill="#E8B468" />
                                                <circle cx="146" cy="77" r="23" fill="#E8B468" />
                                                <circle cx="139" cy="100" r="23" fill="#E8B468" />
                                                <circle cx="123" cy="117" r="23" fill="#E8B468" />
                                                <circle cx="100" cy="121" r="23" fill="#E8B468" />
                                                <circle cx="77" cy="117" r="23" fill="#E8B468" />
                                                <circle cx="61" cy="100" r="23" fill="#E8B468" />
                                                <circle cx="54" cy="77" r="23" fill="#E8B468" />
                                                <circle cx="61" cy="54" r="23" fill="#E8B468" />
                                                <circle cx="77" cy="37" r="23" fill="#E8B468" />
                                                <circle cx="64" cy="69" r="12" fill="#E8B468" />
                                                <circle cx="136" cy="69" r="12" fill="#E8B468" />
                                                <circle cx="64" cy="70" r="6" fill="#F5C1C8" />
                                                <circle cx="136" cy="70" r="6" fill="#F5C1C8" />
                                                <circle cx="100" cy="76" r="45" fill="#FFF8EE" />

                                                <path d="M73 43c3-13 14-20 27-20s24 7 27 20c-10-2-18-8-23-15-7 6-15 9-25 10-2 0-4 2-6 5Z" fill="#9BDDFF" stroke="#75AADB" strokeWidth="1.8" />
                                                <path d="M80 41q20 4 40 0" fill="none" stroke="#FFFFFF" strokeWidth="2" />
                                                <path d="M96 27c0-6 3-9 8-9s8 3 8 9" fill="#75AADB" />
                                                <circle cx="104" cy="23" r="3" fill="#F2C96D" />

                                                <ellipse cx="82" cy="77" rx="9" ry="12" fill="#221815" />
                                                <ellipse cx="118" cy="77" rx="9" ry="12" fill="#221815" />
                                                <circle cx="79" cy="73" r="3.5" fill="#FFFFFF" />
                                                <circle cx="85" cy="82" r="1.8" fill="#FFFFFF" />
                                                <circle cx="115" cy="73" r="3.5" fill="#FFFFFF" />
                                                <circle cx="121" cy="82" r="1.8" fill="#FFFFFF" />
                                                <circle cx="70" cy="94" r="6" fill="#FFB6C1" opacity=".65" />
                                                <circle cx="130" cy="94" r="6" fill="#FFB6C1" opacity=".65" />
                                                <ellipse cx="100" cy="94" rx="12" ry="9" fill="#FFFDF7" />
                                                <path d="M96 91q4-4 8 0l-4 4Z" fill="#8B5A36" />
                                                <path d="M100 95v3m0 0q-5 5-9 0m9 0q5 5 9 0" fill="none" stroke="#8B5A36" strokeWidth="1.5" />
                                            </g>
                                        </svg>
                                    </button>
                                </div>
                                <div className="flex min-w-0 max-w-[320px] flex-col items-center justify-center gap-1.5 text-center">
                                    <p className="font-serif text-lg leading-snug tracking-tight text-slate-800 dark:text-stone-100 sm:text-xl">
                                        A little calm in the city
                                    </p>
                                    <span className="inline-flex w-fit items-center whitespace-nowrap rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium leading-4 text-slate-600 shadow-sm dark:border-stone-600 dark:bg-stone-900 dark:text-stone-300">
                                        🌿 Morningside Heights
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div className="order-2 md:col-start-1 md:row-start-2 md:order-none">
                            <label
                                htmlFor="scenario"
                                className="mb-2 block text-sm font-semibold text-[#2D3748] dark:text-stone-200"
                            >
                                Current activity &amp; stress trigger
                            </label>
                    <textarea
                        id="scenario"
                        ref={scenarioTextareaRef}
                        value={prompt}
                        onChange={(event) => setPrompt(event.target.value)}
                        placeholder="e.g., Grinding for my midterm in the library, feeling like my brain is about to melt..."
                        rows={4}
                        className="w-full resize-y rounded-xl border border-[#DCE8DF] bg-[#F8FBF9] px-4 py-3 text-[#2D3748] placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#5F937B] dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100 dark:placeholder:text-stone-500 dark:focus:ring-emerald-400"
                        disabled={loading}
                        required
                    />
                    <div className="mt-3">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
                            Try these ideas
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {[
                                ['📚', 'Cramming for midterms in the library, brain overloaded'],
                                ['💼', 'Sunday night dread thinking about Monday morning standup'],
                                ['💔', 'Miscommunication with a friend, overthinking everything'],
                            ].map(([icon, idea]) => (
                                <button
                                    key={idea}
                                    type="button"
                                    onClick={() => setPrompt(idea)}
                                    disabled={loading}
                                    className="rounded-full border border-[#DCE8DF] bg-white px-3 py-1.5 text-left text-xs leading-relaxed text-[#476455] transition hover:border-[#8FB49D] hover:bg-[#F2F7F4] disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
                                >
                                    <span aria-hidden="true">{icon} </span>
                                    {idea}
                                </button>
                            ))}
                        </div>
                    </div>
                        </div>
                        </div>
                    </div>

                    <section className="mt-5 rounded-2xl border border-[#DCE8DF] bg-[#F8FBF9] p-4 sm:p-5 dark:border-stone-700 dark:bg-stone-950" aria-labelledby="choose-vibe-title">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                                <h3 id="choose-vibe-title" className="font-serif text-base font-semibold text-[#2D3748] dark:text-stone-100 sm:text-lg">
                                    Invite Roaree into your moment 🐾
                                </h3>
                                <p className="mt-1 max-w-2xl text-xs leading-relaxed text-stone-600 dark:text-stone-400 sm:text-sm">
                                    Share a desk, library, favorite campus spot, or quiet view—Roaree will join you.
                                </p>
                            </div>
                            {vibeImage && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setVibeImage(null);
                                        setVibeImageName(null);
                                        setVibeImageError(null);
                                    }}
                                    className="rounded-full px-3 py-1.5 text-xs font-semibold text-stone-600 transition hover:bg-stone-200/70 hover:text-stone-900 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-white"
                                >
                                    Remove photo
                                </button>
                            )}
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                            <label
                                className="relative inline-flex cursor-pointer items-center gap-2 overflow-hidden rounded-full border border-emerald-200 bg-[#E8F4EC] px-4 py-2.5 text-sm font-semibold text-[#365B48] shadow-sm transition hover:border-emerald-300 hover:bg-emerald-100 focus-within:ring-2 focus-within:ring-emerald-600 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100 dark:hover:bg-emerald-900"
                            >
                                📸 {vibeImage ? 'Change Photo' : 'Choose a Photo'}
                                <input
                                    type="file"
                                    accept="image/jpeg,image/png,.jpg,.jpeg,.png"
                                    onChange={(event) => void handleVibeImageChange(event)}
                                    disabled={loading}
                                    aria-label="Choose a JPG or PNG photo"
                                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                                />
                            </label>
                            <span className="max-w-full truncate text-xs text-stone-500 dark:text-stone-400" title={vibeImageName ?? undefined}>
                                {vibeImageName || 'JPG or PNG · up to 10 MB · stays on your device'}
                            </span>
                        </div>
                        {vibeImageError && (
                            <p className="mt-2 text-sm text-rose-700 dark:text-rose-300" role="alert">
                                {vibeImageError}
                            </p>
                        )}
                        {vibeImage && (
                            <div className="mx-auto mt-4 w-full max-w-[320px]">
                                <div className="relative mx-auto aspect-[3/4] w-full max-w-[240px] overflow-hidden rounded-2xl border border-stone-300/80 bg-stone-200 shadow-inner dark:border-stone-700">
                                    <img src={vibeImage} alt="Your uploaded photo preview" data-fit="cover" className="absolute inset-0 h-full w-full rounded-2xl object-cover" />
                                    <LionSticker
                                        position={stickerPosition}
                                        onPointerDown={handleStickerPointerDown}
                                        onPointerMove={handleStickerPointerMove}
                                        onPointerUp={handleStickerPointerUp}
                                    />
                                </div>
                                <div className="mt-3 grid gap-2 sm:grid-cols-2 sm:gap-3">
                                    <p className="text-xs leading-relaxed text-stone-600 dark:text-stone-400 sm:col-span-2">
                                        Drag Roaree anywhere in the photo, then fine-tune the size and angle.
                                    </p>
                                    <label className="text-xs font-medium text-stone-700 dark:text-stone-300">
                                        Lion size
                                        <input
                                            type="range"
                                            min="0.6"
                                            max="1.6"
                                            step="0.05"
                                            value={stickerPosition.scale}
                                            onChange={(event) => setStickerPosition((position) => ({ ...position, scale: Number(event.target.value) }))}
                                            className="mt-1 block w-full accent-[#5F937B]"
                                            aria-label="Lion size"
                                        />
                                    </label>
                                    <label className="text-xs font-medium text-stone-700 dark:text-stone-300">
                                        Lion rotation
                                        <input
                                            type="range"
                                            min="-45"
                                            max="45"
                                            step="1"
                                            value={stickerPosition.rotation}
                                            onChange={(event) => setStickerPosition((position) => ({ ...position, rotation: Number(event.target.value) }))}
                                            className="mt-1 block w-full accent-[#5F937B]"
                                            aria-label="Lion rotation"
                                        />
                                    </label>
                                </div>
                            </div>
                        )}
                    </section>

                    <div className="mt-6 grid gap-6 sm:grid-cols-2">
                        <div>
                            <div className="mb-2 flex items-center justify-between">
                                <label
                                    htmlFor="stress-level"
                                    className="text-sm font-semibold text-[#2D3748] dark:text-stone-200"
                                >
                                    Stress Level
                                </label>
                                <span className="rounded-full bg-[#E8F4EC] px-3 py-1 text-sm font-bold text-[#2D6A4F] dark:bg-emerald-950 dark:text-emerald-200">
                                    {stressLevel}/10
                                </span>
                            </div>
                            <input
                                id="stress-level"
                                type="range"
                                min="1"
                                max="10"
                                value={stressLevel}
                                onChange={(event) => setStressLevel(Number(event.target.value))}
                                className="w-full accent-[#5F937B] dark:accent-emerald-400"
                                disabled={loading}
                            />
                            <p className="mt-2 text-sm font-medium text-stone-600 dark:text-stone-300">
                                {stressLevel <= 3
                                    ? '🌱 1-3 Mild Anxiety'
                                    : stressLevel <= 7
                                        ? '⚡ 4-7 Standard Meltdown'
                                        : '🔥 8-10 Ready to Drop Out'}
                            </p>
                        </div>

                        <fieldset>
                            <legend className="mb-2 text-sm font-semibold text-stone-700 dark:text-stone-200">
                                Tone
                            </legend>
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                <button
                                    type="button"
                                    onClick={() => setTone('gentle')}
                                    aria-pressed={tone === 'gentle'}
                                    disabled={loading}
                                    className={`rounded-xl border p-4 text-left text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                                        tone === 'gentle'
                                            ? 'border-[#4E816A] bg-[#4E816A] text-white hover:bg-[#3D6E58] dark:border-emerald-400 dark:bg-emerald-400 dark:text-stone-950'
                                            : 'border-stone-300 bg-stone-50 text-stone-800 hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100 dark:hover:bg-stone-800'
                                    }`}
                                >
                                    <span className="block">🌿 Gentle Stoic</span>
                                    <span className={`mt-1.5 block text-xs font-normal leading-relaxed opacity-85 ${
                                        tone === 'gentle' ? 'text-white/90 dark:text-stone-900/80' : 'text-stone-600 dark:text-stone-300'
                                    }`}>
                                        Calm &amp; rational · Focus on what you can control
                                    </span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setTone('roast')}
                                    aria-pressed={tone === 'roast'}
                                    disabled={loading}
                                    className={`rounded-xl border p-4 text-left text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                                        tone === 'roast'
                                            ? 'border-amber-700 bg-amber-700 text-white dark:border-amber-400 dark:bg-amber-400 dark:text-stone-950'
                                            : 'border-stone-300 bg-stone-50 text-stone-800 hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100 dark:hover:bg-stone-800'
                                    }`}
                                >
                                    <span className="block">☕ NYC Roasters</span>
                                    <span className={`mt-1.5 block text-xs font-normal leading-relaxed opacity-85 ${
                                        tone === 'roast' ? 'text-white/90 dark:text-stone-900/80' : 'text-stone-600 dark:text-stone-300'
                                    }`}>
                                        Sharp &amp; witty · Roasting your worries down to size
                                    </span>
                                </button>
                            </div>
                        </fieldset>
                    </div>

                    {generationError && (
                        <p
                            role="alert"
                            className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-relaxed text-rose-800 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-200"
                        >
                            {generationError}
                        </p>
                    )}

                    <button
                        type="submit"
                        disabled={isGenerating || !prompt.trim() || !time || location.trim().length < 2}
                        className="mt-6 w-full rounded-xl bg-[#4E816A] px-6 py-3 font-semibold text-white shadow-sm transition-colors duration-200 hover:bg-[#3D6E58] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-emerald-400 dark:text-stone-950 dark:hover:bg-emerald-300"
                    >
                        {isGenerating ? 'Generating...' : 'Find some perspective'}
                    </button>
                </form>
            </section>

            {loading && (
                <section className="mx-auto mb-8 max-w-3xl" aria-label="Generation progress">
                    <StoicLoader />
                </section>
            )}

            {latestReflection && (() => {
                const content = getJournalContent(latestReflection.output_text);
                return (
                    <section
                        ref={latestReflectionRef}
                        className="mx-auto mb-10 max-w-3xl scroll-mt-8"
                        aria-labelledby="latest-reflection-title"
                    >
                        <h2
                            id="latest-reflection-title"
                            className="mb-5 font-serif text-2xl font-semibold text-stone-800 dark:text-stone-100"
                        >
                            ✨ Your Stoic Prescription &amp; Polaroid
                        </h2>
                        <article className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-lg dark:border-emerald-900 dark:bg-stone-900 sm:p-7">
                            <p className="font-serif text-2xl leading-relaxed text-stone-900 dark:text-stone-100">
                                {content.analysis}
                            </p>
                            {getCopingSteps(content.coping_action).length > 0 ? (
                                <div className="my-6 rounded-xl border border-[#E0EBE3] bg-[#F8FBF9] p-4 dark:border-stone-800 dark:bg-stone-950">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <h3 className="text-xs font-bold uppercase tracking-wide text-[#365B48] dark:text-emerald-200">
                                            🌱 1-Minute Grounding Action
                                        </h3>
                                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                                            ⚡ 60s Micro-Task
                                        </span>
                                    </div>
                                    <ol className="mt-3 space-y-2">
                                        {getCopingSteps(content.coping_action).map((step, index) => (
                                            <li key={`${index}-${step}`} className="flex gap-2 text-sm leading-relaxed text-stone-700 dark:text-stone-300">
                                                <span className="shrink-0 font-semibold text-[#5F937B] dark:text-emerald-300">
                                                    Step {index + 1}:
                                                </span>
                                                <span>{step}</span>
                                            </li>
                                        ))}
                                    </ol>
                                </div>
                            ) : content.actions ? (
                                <div className="my-6 grid gap-3 sm:grid-cols-3">
                                    <div className="rounded-xl bg-stone-50 p-4 dark:bg-stone-950">
                                        <h3 className="mb-2 text-sm font-semibold text-stone-800 dark:text-stone-100">◉ 1-minute reset</h3>
                                        <p className="text-sm text-stone-600 dark:text-stone-300">{content.actions.meditation}</p>
                                    </div>
                                    <div className="rounded-xl bg-stone-50 p-4 dark:bg-stone-950">
                                        <h3 className="mb-2 text-sm font-semibold text-stone-800 dark:text-stone-100">↗ 3-minute walk</h3>
                                        <p className="text-sm text-stone-600 dark:text-stone-300">{content.actions.walk}</p>
                                    </div>
                                    <div className="rounded-xl bg-stone-50 p-4 dark:bg-stone-950">
                                        <h3 className="mb-2 text-sm font-semibold text-stone-800 dark:text-stone-100">✧ Nearby anchor</h3>
                                        <p className="text-sm text-stone-600 dark:text-stone-300">{content.actions.nearby_anchor}</p>
                                    </div>
                                </div>
                            ) : null}
                            <div className="mx-auto mt-7 max-w-3xl">
                                <VentCard
                                    id={`journal-card-latest-${latestReflection.id}`}
                                    author={content.author_name || currentUser?.user_metadata.full_name || 'Your journal'}
                                    location={content.location || location || 'Morningside'}
                                    dateLabel={formatEnglishDate(latestReflection.created_at)}
                                    prompt={latestReflection.prompt}
                                    analysis={content.analysis}
                                    stressLevel={latestReflection.stress_level ?? stressLevel}
                                    stoicQuote={latestReflection.stoic_quote}
                                    image={
                                        latestReflection.imageUrl ||
                                        latestReflection.image_url ||
                                        content.image_url ||
                                        createPostImageUrl(
                                            latestReflection.image_prompt || content.image_prompt || latestReflection.prompt,
                                            latestReflection.id,
                                            new Date(latestReflection.created_at).getTime(),
                                        )
                                    }
                                    imageAlt={latestReflection.userImage
                                        ? 'Your uploaded photo with Roaree'
                                        : latestReflection.stoic_quote || 'Reflection illustration'}
                                    imagePreloaded={latestReflection.imagePreloaded}
                                    userImage={latestReflection.userImage}
                                    stickerPosition={latestReflection.stickerPosition}
                                    copingSteps={getCopingSteps(content.coping_action)}
                                    actions={content.actions}
                                    downloading={downloadingCard === latestReflection.id}
                                    onDownload={() => void handleDownloadCard(
                                        latestReflection.id,
                                        `journal-card-latest-${latestReflection.id}`,
                                    )}
                                />
                            </div>
                            {renderCommentsSection(latestReflection.id)}
                        </article>
                    </section>
                );
            })()}

            <section className="mx-auto max-w-3xl" aria-labelledby="vent-feed-title">
                <div
                    className="my-10 flex w-full items-center justify-center px-4"
                    aria-hidden="true"
                >
                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-emerald-200/80 to-emerald-300/60" />
                    <div className="flex select-none items-center gap-2 px-4 text-[#4A6B5D]/70">
                        <svg
                            className="h-5 w-5 -scale-x-100 opacity-80"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <path d="M12 22C12 22 13 16 9 12C5 8 7 3 7 3C7 3 12 5 13 9C14 13 12 22 12 22Z" fill="currentColor" fillOpacity="0.15" />
                            <path d="M12 22C12 17 17 14 19 9" />
                        </svg>
                        <span className="rounded-full border border-emerald-100 bg-emerald-50/80 px-2 py-0.5 font-serif text-xs font-medium uppercase tracking-widest text-emerald-800/70">
                            🌿 Campus Whispers 🌿
                        </span>
                        <svg
                            className="h-5 w-5 opacity-80"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <path d="M12 22C12 22 13 16 9 12C5 8 7 3 7 3C7 3 12 5 13 9C14 13 12 22 12 22Z" fill="currentColor" fillOpacity="0.15" />
                            <path d="M12 22C12 17 17 14 19 9" />
                        </svg>
                    </div>
                    <div className="h-px flex-1 bg-gradient-to-l from-transparent via-emerald-200/80 to-emerald-300/60" />
                </div>
                <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <h2 id="vent-feed-title" className="font-serif text-2xl font-semibold text-stone-800 dark:text-stone-100">
                            Morningside Vent Feed
                        </h2>
                        <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
                            A little perspective, and a reminder you’re not alone.
                        </p>
                        {localPosts.length > 0 && (
                            <button
                                type="button"
                                onClick={clearSavedLocalPosts}
                                className="mt-2 text-xs font-semibold text-stone-500 underline decoration-stone-300 underline-offset-2 transition hover:text-rose-700 dark:text-stone-400 dark:hover:text-rose-300"
                            >
                                Clear {localPosts.length} locally saved {localPosts.length === 1 ? 'post' : 'posts'}
                            </button>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                    <div className="flex rounded-xl border border-stone-200 bg-white p-1 dark:border-stone-800 dark:bg-stone-900">
                        <button
                            type="button"
                            onClick={() => {
                                if (feedPageTimer.current !== null) window.clearTimeout(feedPageTimer.current);
                                setLoadingMorePosts(false);
                                setVisiblePostCount(FEED_PAGE_SIZE);
                                setFeedSort('latest');
                            }}
                            aria-pressed={feedSort === 'latest'}
                            className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                                feedSort === 'latest'
                                    ? 'bg-stone-800 text-white dark:bg-stone-100 dark:text-stone-900'
                                    : 'text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800'
                            }`}
                        >
                            🕒 Latest
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                if (feedPageTimer.current !== null) window.clearTimeout(feedPageTimer.current);
                                setLoadingMorePosts(false);
                                setVisiblePostCount(FEED_PAGE_SIZE);
                                setFeedSort('highest-stress');
                            }}
                            aria-pressed={feedSort === 'highest-stress'}
                            className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                                feedSort === 'highest-stress'
                                    ? 'bg-stone-800 text-white dark:bg-stone-100 dark:text-stone-900'
                                    : 'text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800'
                            }`}
                        >
                            🌋 Most Stressed
                        </button>
                    </div>
                    <div className="group relative">
                        <button
                            type="button"
                            aria-label="Explain Most Stressed ranking"
                            aria-expanded={showTrendingHelp}
                            onClick={() => setShowTrendingHelp((visible) => !visible)}
                            className="flex size-8 items-center justify-center rounded-full text-sm font-semibold text-stone-500 transition hover:bg-emerald-50 hover:text-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-emerald-200"
                        >
                            ⓘ
                        </button>
                        <div
                            role="tooltip"
                            className={`${showTrendingHelp ? 'block' : 'hidden'} absolute right-0 top-full z-30 mt-2 w-72 rounded-2xl border border-emerald-100 bg-white p-3 text-left text-xs font-normal leading-relaxed text-stone-600 shadow-lg group-hover:block group-focus-within:block dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300`}
                        >
                            Ranked by community support (Coffee ×1.5 + Hugs ×1.0) with a recency decay factor, highlighting voices that need support right now.
                        </div>
                    </div>
                    </div>
                </div>

                <div
                    role="tablist"
                    aria-label="Filter community moments"
                    className="mb-5 flex w-full gap-1 overflow-x-auto rounded-2xl border border-[#DCE8DF] bg-white p-1.5 dark:border-stone-800 dark:bg-stone-900 sm:w-fit"
                >
                    {([
                        { id: 'explore', label: '🌟 Explore All' },
                        { id: 'mine', label: '📝 My Posts' },
                        { id: 'interacted', label: '❤️ Interacted' },
                    ] as const).map((tab) => (
                        <button
                            key={tab.id}
                            id={`feed-tab-${tab.id}`}
                            type="button"
                            role="tab"
                            aria-selected={feedTab === tab.id}
                            aria-controls="community-feed-panel"
                            tabIndex={feedTab === tab.id ? 0 : -1}
                            onClick={() => selectFeedTab(tab.id)}
                            onKeyDown={(event) => {
                                const tabs = Array.from(
                                    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [],
                                );
                                const currentIndex = tabs.indexOf(event.currentTarget);
                                const nextTab = event.key === 'ArrowRight'
                                    ? tabs[(currentIndex + 1) % tabs.length]
                                    : event.key === 'ArrowLeft'
                                        ? tabs[(currentIndex - 1 + tabs.length) % tabs.length]
                                        : event.key === 'Home'
                                            ? tabs[0]
                                            : event.key === 'End'
                                                ? tabs[tabs.length - 1]
                                                : undefined;
                                if (!nextTab) return;
                                event.preventDefault();
                                const nextTabId = nextTab.id.replace('feed-tab-', '') as FeedTab;
                                nextTab.focus();
                                selectFeedTab(nextTabId);
                            }}
                            className={`shrink-0 rounded-xl px-3 py-2 text-sm font-semibold transition sm:px-4 ${
                                feedTab === tab.id
                                    ? 'bg-[#E8F4EC] text-[#2D6A4F] shadow-sm dark:bg-emerald-950 dark:text-emerald-200'
                                    : 'text-stone-600 hover:bg-stone-50 dark:text-stone-300 dark:hover:bg-stone-800'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                <div
                    id="community-feed-panel"
                    role="tabpanel"
                    aria-labelledby={`feed-tab-${feedTab}`}
                    ref={feedListRef}
                    className="scroll-mt-6"
                >
                {feedError && (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
                        <p>{feedError}</p>
                        <button
                            type="button"
                            onClick={() => void fetchGenerations()}
                            className="mt-3 text-sm font-semibold underline"
                        >
                            Try again
                        </button>
                    </div>
                )}

                {feedLoading ? (
                    <div className="space-y-4" aria-label="Loading vent feed">
                        {[0, 1, 2].map((skeleton) => (
                            <div
                                key={skeleton}
                                className="animate-pulse rounded-2xl border border-stone-200 bg-white p-6 dark:border-stone-800 dark:bg-stone-900"
                            >
                                <div className="mb-4 h-4 w-28 rounded bg-stone-200 dark:bg-stone-700" />
                                <div className="mb-3 h-5 w-4/5 rounded bg-stone-200 dark:bg-stone-700" />
                                <div className="h-4 w-2/3 rounded bg-stone-200 dark:bg-stone-700" />
                                <div className="mt-6 h-10 w-48 rounded-xl bg-stone-200 dark:bg-stone-700" />
                            </div>
                        ))}
                    </div>
                ) : !feedError && filteredGenerations.length === 0 ? (
                    <div className="rounded-2xl border border-[#E0EBE3] bg-gradient-to-br from-[#F8FBF9] to-[#FFFDF8] px-5 py-10 text-center dark:border-stone-800 dark:from-stone-900 dark:to-stone-950">
                        <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-emerald-50 text-3xl dark:bg-emerald-950">
                            {feedTab === 'interacted' ? '💌' : feedTab === 'mine' ? '🌱' : '🦁'}
                        </div>
                        <h3 className="font-serif text-xl font-semibold text-stone-800 dark:text-stone-100">
                            {feedTab === 'mine'
                                ? currentUser ? 'Your story starts here' : 'Sign in to find your posts'
                                : feedTab === 'interacted' ? 'No moments saved just yet' : 'A quiet moment in the feed'}
                        </h3>
                        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-stone-600 dark:text-stone-400">
                            {feedTab === 'mine'
                                ? currentUser
                                    ? 'No posts yet. Share what’s on your mind today!'
                                    : 'Your posts will be gathered here after you sign in and share a reflection.'
                                : feedTab === 'interacted'
                                    ? currentUser
                                        ? 'Hug a post, send a coffee, or share a resonant reply to find it here.'
                                        : 'Sign in to keep track of posts you support or reply to.'
                                    : 'No posts yet. Be the first to share what’s on your mind today!'}
                        </p>
                        <button
                            type="button"
                            onClick={() => {
                                scenarioTextareaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                scenarioTextareaRef.current?.focus({ preventScroll: true });
                            }}
                            className="mt-5 rounded-xl bg-[#4E816A] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#3D6E58] dark:bg-emerald-400 dark:text-stone-950 dark:hover:bg-emerald-300"
                        >
                            ✍️ Write a Post
                        </button>
                    </div>
                ) : (
                    <div className="space-y-5">
                        {visibleGenerations.map((post) => {
                            const item = post;
                            const uploadedPhoto = getUserUploadedImage(item);
                            const content = getJournalContent(item.output_text);
                            const journalLocation = content.location || 'Morningside';
                            const reactedHug = generationCardContent(item.id, 'hug');
                            const reactedCoffee = generationCardContent(item.id, 'coffee');
                            const hasHugged = reactedHug;
                            const hasCoffeed = reactedCoffee;
                            const hugCount = reactionCounts[item.id]?.hug ?? item.hug_count ?? 0;
                            const coffeeCount = reactionCounts[item.id]?.coffee ?? item.coffee_count ?? 0;
                            const hugPendingKey = `${currentUser?.id ?? 'anonymous'}:${item.id}:hug`;
                            const coffeePendingKey = `${currentUser?.id ?? 'anonymous'}:${item.id}:coffee`;

                            return (
                                <article
                                    key={item.id}
                                    className="rounded-2xl border border-stone-200 bg-[#FDFAF6] p-4 shadow-sm transition hover:shadow-md dark:border-stone-800 dark:bg-stone-900 sm:p-5"
                                >
                                    <VentCard
                                        id={`journal-card-${item.id}`}
                                        author="Anonymous · Morningside student"
                                        location={journalLocation}
                                        dateLabel={formatEnglishDate(item.created_at)}
                                        prompt={item.prompt}
                                        analysis={content.analysis}
                                        stressLevel={item.stress_level}
                                        stoicQuote={item.stoic_quote}
                                        image={post.imageUrl}
                                        imageAlt={uploadedPhoto
                                            ? 'A community photo with Roaree'
                                            : item.stoic_quote || 'Reflection illustration'}
                                        imagePreloaded={post.imagePreloaded}
                                        userImage={uploadedPhoto}
                                        stickerPosition={item.stickerPosition}
                                        copingSteps={getCopingSteps(content.coping_action)}
                                        actions={content.actions}
                                        downloading={downloadingCard === item.id}
                                        onDownload={() => void handleDownloadCard(item.id)}
                                    />

                                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 pt-4 dark:border-stone-800">
                                        <time dateTime={item.created_at} className="text-xs text-stone-500 dark:text-stone-400">
                                            {formatEnglishDate(item.created_at)}
                                        </time>
                                        <div className="flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                onClick={() => void handleReaction(item.id, 'hug')}
                                                disabled={pendingReactions[hugPendingKey]}
                                                aria-pressed={hasHugged}
                                                title="Send warmth and emotional support"
                                                className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition disabled:cursor-wait disabled:opacity-70 ${
                                                    hasHugged
                                                        ? 'border-emerald-500 bg-emerald-100 text-emerald-800 ring-2 ring-emerald-200 dark:border-emerald-600 dark:bg-emerald-950/70 dark:text-emerald-200'
                                                        : 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-stone-900 dark:text-emerald-300 dark:hover:bg-emerald-950/40'
                                                }`}
                                            >
                                                <span>🫂 Hug</span>
                                                <span className={`rounded-full px-2 py-0.5 text-xs ${
                                                    hasHugged
                                                        ? 'bg-emerald-200 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100'
                                                        : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100'
                                                }`}>{hugCount}</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (!currentUser) {
                                                        showToast('Please sign in to send a coffee offer.');
                                                        return;
                                                    }
                                                    setCoffeeSocialHandle('');
                                                    setCoffeeOfferError(null);
                                                    setCoffeeOfferGenerationId(item.id);
                                                }}
                                                disabled={pendingReactions[coffeePendingKey] || coffeeOfferSubmitting}
                                                aria-pressed={hasCoffeed}
                                                title="Send a tactical coffee boost: You'll pull through tonight!"
                                                className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition disabled:cursor-wait disabled:opacity-70 ${
                                                    hasCoffeed
                                                        ? 'border-amber-800 bg-amber-900 text-amber-50 ring-2 ring-amber-200 dark:border-amber-500 dark:bg-amber-950 dark:text-amber-100'
                                                        : 'border-amber-300 bg-white text-amber-800 hover:bg-amber-50 dark:border-amber-900 dark:bg-stone-900 dark:text-amber-300 dark:hover:bg-amber-950/40'
                                                }`}
                                            >
                                                <span>☕ Coffee on Me</span>
                                                <span className={`rounded-full px-2 py-0.5 text-xs ${
                                                    hasCoffeed
                                                        ? 'bg-amber-800 text-amber-50 dark:bg-amber-800 dark:text-amber-100'
                                                        : 'bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100'
                                                }`}>{coffeeCount}</span>
                                            </button>
                                            {hasCoffeed && (
                                                <button
                                                    type="button"
                                                    onClick={() => void handleCancelCoffee(item.id)}
                                                    disabled={pendingReactions[coffeePendingKey]}
                                                    className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-wait disabled:opacity-60 dark:border-rose-900 dark:bg-stone-900 dark:text-rose-300 dark:hover:bg-rose-950/40"
                                                >
                                                    Cancel Coffee
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    {renderCommentsSection(item.id)}
                                </article>
                            );
                        })}
                    </div>
                )}
                {!feedLoading && !feedError && filteredGenerations.length > 0 && (
                    <div className="mt-6 flex flex-col items-center gap-3">
                        <p className="text-sm text-stone-500 dark:text-stone-400" aria-live="polite">
                            Showing {visibleGenerations.length} of {filteredGenerations.length} moments
                        </p>
                        {visibleGenerations.length < filteredGenerations.length ? (
                            <button
                                type="button"
                                onClick={loadMorePosts}
                                disabled={loadingMorePosts}
                                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#C9DCCF] bg-white px-5 py-2.5 text-sm font-semibold text-[#365B48] shadow-sm transition hover:bg-[#F2F7F4] disabled:cursor-wait disabled:opacity-70 dark:border-stone-700 dark:bg-stone-900 dark:text-emerald-200 dark:hover:bg-stone-800"
                            >
                                {loadingMorePosts && (
                                    <svg
                                        aria-hidden="true"
                                        viewBox="0 0 24 24"
                                        className="size-4 animate-spin"
                                        fill="none"
                                    >
                                        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
                                        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                                    </svg>
                                )}
                                {loadingMorePosts ? 'Loading posts...' : 'Load More Posts'}
                            </button>
                        ) : (
                            <p className="rounded-full bg-[#F2F7F4] px-4 py-2 text-sm font-medium text-[#557565] dark:bg-stone-900 dark:text-stone-300">
                                You’re all caught up ✨
                            </p>
                        )}
                    </div>
                )}
                </div>
            </section>
        </main>
    );
}
