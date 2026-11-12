import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { View, Pressable, TextInput, useWindowDimensions } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Icon } from './Icon';
import { Text } from './Text';
import { useThemeStore } from '../../store/themeStore';

interface CustomEmojiPickerProps {
  onSelect: (emoji: string) => void;
  insetsBottom: number;
}

const COLUMNS = 8;
const ROW_HEIGHT = 46;

const CATEGORIES = [
  { key: 'emotion', name: 'Smileys & Emotion', icon: 'mood' },
  { key: 'people', name: 'People & Body', icon: 'person' },
  { key: 'nature', name: 'Animals & Nature', icon: 'eco' },
  { key: 'food', name: 'Food & Drink', icon: 'restaurant' },
  { key: 'activities', name: 'Activities', icon: 'sports-soccer' },
  { key: 'places', name: 'Travel & Places', icon: 'place' },
  { key: 'objects', name: 'Objects', icon: 'lightbulb' },
  { key: 'symbols', name: 'Symbols', icon: 'category' },
  { key: 'flags', name: 'Flags', icon: 'flag' },
] as const;

type Row =
  | { type: 'header'; key: string; title: string; cat: number }
  | { type: 'row'; key: string; emojis: string[]; cat: number };

interface EmojiData {
  rows: Row[];
  headerIndex: number[]; // index in `rows` of each category header
  search: { emoji: string; hay: string }[];
}

// Built once and kept in memory. The dataset (about 3,700 emojis with names and keywords) is large,
// so it is only loaded on demand: `warmEmojiData()` runs shortly after a chat opens, off the
// critical path, and the picker itself just reads the result.
let cache: EmojiData | null = null;

function buildData(): EmojiData {
  if (cache) return cache;
  const { emojis } = require('rn-emoji-picker/dist/data') as {
    emojis: { emoji: string; name: string; keywords: string[]; category: string; order: number }[];
  };

  const byCategory = new Map<string, typeof emojis>();
  for (const e of emojis) {
    const key = e.category.toLowerCase();
    const list = byCategory.get(key);
    if (list) list.push(e);
    else byCategory.set(key, [e]);
  }

  const rows: Row[] = [];
  const headerIndex: number[] = [];
  CATEGORIES.forEach((cat, ci) => {
    const list = (byCategory.get(cat.name.toLowerCase()) ?? []).slice().sort((a, b) => a.order - b.order);
    headerIndex.push(rows.length);
    rows.push({ type: 'header', key: `h-${cat.key}`, title: cat.name, cat: ci });
    for (let i = 0; i < list.length; i += COLUMNS) {
      rows.push({ type: 'row', key: `${cat.key}-${i}`, emojis: list.slice(i, i + COLUMNS).map((e) => e.emoji), cat: ci });
    }
  });

  const search = emojis.map((e) => ({ emoji: e.emoji, hay: `${e.name} ${e.keywords.join(' ')}`.toLowerCase() }));
  cache = { rows, headerIndex, search };
  return cache;
}

export function warmEmojiData() {
  try {
    buildData();
  } catch (e) {
    console.warn('[emoji] could not preload data:', e);
  }
}

const EmojiRow = React.memo(({ emojis, onSelect, cellWidth }: { emojis: string[]; onSelect: (e: string) => void; cellWidth: number }) => (
  <View style={{ flexDirection: 'row', height: ROW_HEIGHT, paddingHorizontal: 8 }}>
    {emojis.map((emoji) => (
      <Pressable
        key={emoji}
        onPress={() => onSelect(emoji)}
        style={{ width: cellWidth, height: ROW_HEIGHT, alignItems: 'center', justifyContent: 'center' }}
      >
        <Text style={{ fontSize: 26 }}>{emoji}</Text>
      </Pressable>
    ))}
  </View>
));
EmojiRow.displayName = 'EmojiRow';

export const CustomEmojiPicker = React.memo(({ onSelect, insetsBottom }: CustomEmojiPickerProps) => {
  const { width } = useWindowDimensions();
  const colors = useThemeStore((state) => state.colors);
  const listRef = useRef<any>(null);
  const [data, setData] = useState<EmojiData | null>(cache);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [activeIndex, setActiveIndex] = useState(0);

  // If the data was not warmed yet, build it right after the first frame so the sheet itself opens at once
  useEffect(() => {
    if (cache) return;
    const t = setTimeout(() => setData(buildData()), 0);
    return () => clearTimeout(t);
  }, []);

  const cellWidth = (width - 16) / COLUMNS;

  const searchRows = useMemo<Row[]>(() => {
    const q = deferredQuery.trim().toLowerCase();
    if (!q || !data) return [];
    const hits = data.search.filter((e) => e.hay.includes(q)).slice(0, 240).map((e) => e.emoji);
    const rows: Row[] = [];
    for (let i = 0; i < hits.length; i += COLUMNS) rows.push({ type: 'row', key: `s-${i}`, emojis: hits.slice(i, i + COLUMNS), cat: 0 });
    return rows;
  }, [deferredQuery, data]);

  const searching = query.trim().length > 0;
  const rows = searching ? searchRows : data?.rows ?? [];

  const handleTab = useCallback(
    (index: number) => {
      if (!data) return;
      setActiveIndex(index);
      listRef.current?.scrollToIndex({ index: data.headerIndex[index], animated: false });
    },
    [data]
  );

  // Keep the highlighted tab in step with what is on screen
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: { item: Row }[] }) => {
    const first = viewableItems[0]?.item;
    if (first) setActiveIndex((prev) => (prev === first.cat ? prev : first.cat));
  }).current;

  const renderItem = useCallback(
    ({ item }: { item: Row }) =>
      item.type === 'header' ? (
        <Text style={{ color: colors.outline, fontSize: 12, fontWeight: '700', paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4 }}>
          {item.title}
        </Text>
      ) : (
        <EmojiRow emojis={item.emojis} onSelect={onSelect} cellWidth={cellWidth} />
      ),
    [colors.outline, onSelect, cellWidth]
  );

  return (
    <View
      style={{
        height: 340,
        paddingBottom: Math.max(insetsBottom, 12),
        backgroundColor: colors.surfaceContainerLowest,
        borderTopColor: colors.divider,
        borderTopWidth: 1,
      }}
      className="flex-col z-10"
    >
      {/* Search */}
      <View
        style={{ borderBottomColor: colors.divider, borderBottomWidth: 1, backgroundColor: colors.surfaceContainerLowest }}
        className="px-3 py-2 flex-row items-center gap-2"
      >
        <Icon name="search" size={20} color={colors.outline} />
        <TextInput
          placeholder="Search emoji"
          placeholderTextColor={colors.outline}
          value={query}
          onChangeText={setQuery}
          style={{ height: 36, backgroundColor: colors.surfaceContainerLow, color: colors.onSurface }}
          className="flex-1 px-3 py-1.5 rounded-full text-sm"
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery('')} className="p-1">
            <Icon name="close" size={18} color={colors.outline} />
          </Pressable>
        )}
      </View>

      <View style={{ flex: 1 }}>
        <FlashList
          ref={listRef}
          data={rows}
          keyExtractor={(item) => item.key}
          getItemType={(item) => item.type}
          renderItem={renderItem}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 12 }}
          ListEmptyComponent={
            searching ? (
              <Text style={{ color: colors.outline, textAlign: 'center', padding: 24 }}>No emoji found</Text>
            ) : null
          }
        />
      </View>

      {/* Category tabs */}
      {!searching && (
        <View
          style={{ backgroundColor: colors.surfaceContainerLow, borderTopColor: colors.divider, borderTopWidth: 1 }}
          className="flex-row h-11 items-center justify-around shrink-0"
        >
          {CATEGORIES.map((cat, index) => {
            const isActive = index === activeIndex;
            return (
              <Pressable key={cat.key} onPress={() => handleTab(index)} className="flex-1 items-center justify-center h-full relative">
                <Icon name={cat.icon as any} size={22} color={isActive ? colors.primary : colors.outline} />
                {isActive && <View style={{ backgroundColor: colors.primary }} className="absolute bottom-0 left-3 right-3 h-[3px] rounded-t-full" />}
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
});
CustomEmojiPicker.displayName = 'CustomEmojiPicker';
