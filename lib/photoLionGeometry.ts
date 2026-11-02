export type Box = [number, number, number, number];
export type LionPlacement = {
    x: number;
    y: number;
    width: number;
    pose: 'sit' | 'stand';
    mode: 'support' | 'companion_margin';
    reason: 'empty_seat' | 'clear_floor' | 'no_safe_support';
};

export function parseBox(value: unknown): Box {
    if (!Array.isArray(value) || value.length !== 4 || value.some((coordinate) => typeof coordinate !== 'number' || !Number.isFinite(coordinate) || coordinate < 0 || coordinate > 1000) || value[0] >= value[2] || value[1] >= value[3]) throw new Error('Invalid scene box.');
    return value as Box;
}

export function lionBounds(placement: LionPlacement, width: number, height: number) {
    const lionWidth = Math.max(1, Math.round(Math.min(width * placement.width, height * 0.4)));
    const lionHeight = Math.round(lionWidth * 1.25);
    const left = Math.round(placement.x * width - lionWidth / 2);
    const top = Math.round(placement.y * height - lionHeight * (placement.pose === 'sit' ? 0.81 : 0.95));
    return { left, top, width: lionWidth, height: lionHeight };
}

export function overlaps(first: Box, second: Box, padding = 12): boolean {
    return first[1] < second[3] + padding && first[3] > second[1] - padding && first[0] < second[2] + padding && first[2] > second[0] - padding;
}

export function choosePlacement(value: unknown, width: number, height: number): LionPlacement {
    if (!value || typeof value !== 'object') throw new Error('Missing scene geometry.');
    const scene = value as Record<string, unknown>;
    if (scene.error === 'no_safe_support') return { x: 0.5, y: 0.95, width: 0.12, pose: 'stand', mode: 'companion_margin', reason: 'no_safe_support' };
    if (!Array.isArray(scene.people) || !Array.isArray(scene.faces) || !Array.isArray(scene.obstacles) || !Array.isArray(scene.supports) || [...scene.people, ...scene.faces, ...scene.obstacles, ...scene.supports].length > 200) throw new Error('Missing scene geometry.');
    const blocked = [...scene.people, ...scene.faces, ...scene.obstacles].map(parseBox);
    const supports = scene.supports.map((value) => {
        if (!value || typeof value !== 'object') throw new Error('Invalid support.');
        const support = value as Record<string, unknown>;
        if (support.kind !== 'seat' && support.kind !== 'floor') throw new Error('Invalid support.');
        return { kind: support.kind, box: parseBox(support.box_2d) };
    });
    for (const support of supports) {
        for (const fraction of [0.5, 0.25, 0.75]) {
            for (const size of [0.2, 0.14, 0.09]) {
                const placement: LionPlacement = {
                    x: (support.box[1] + (support.box[3] - support.box[1]) * fraction) / 1000,
                    y: (support.kind === 'seat' ? support.box[0] : support.box[0] + (support.box[2] - support.box[0]) * 0.7) / 1000,
                    width: Math.min(size, (support.box[3] - support.box[1]) / 1000 * 0.75),
                    pose: support.kind === 'seat' ? 'sit' : 'stand',
                    mode: 'support',
                    reason: support.kind === 'seat' ? 'empty_seat' : 'clear_floor',
                };
                const bounds = lionBounds(placement, width, height);
                if (bounds.width < width * 0.055 || bounds.left < 0 || bounds.top < 0 || bounds.left + bounds.width > width || bounds.top + bounds.height > height) continue;
                const box: Box = [bounds.top / height * 1000, bounds.left / width * 1000, (bounds.top + bounds.height) / height * 1000, (bounds.left + bounds.width) / width * 1000];
                if (!blocked.some((obstacle) => overlaps(box, obstacle))) return placement;
            }
        }
    }
    return { x: 0.5, y: 0.95, width: 0.12, pose: 'stand', mode: 'companion_margin', reason: 'no_safe_support' };
}
