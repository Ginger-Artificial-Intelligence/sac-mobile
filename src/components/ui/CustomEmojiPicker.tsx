import React, { useRef, useState, useMemo, useCallback } from 'react';
import { View, FlatList, Pressable, TextInput, useWindowDimensions } from 'react-native';
import { Icon } from './Icon';
import { Text } from './Text';
import { emojis } from 'rn-emoji-picker/dist/data';
import { storage } from '../../store/mmkv';
import { useThemeStore } from '../../store/themeStore';

interface CustomEmojiPickerProps {
  onSelect: (emoji: string) => void;
  insetsBottom: number;
}

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
];

const getCategoryName = (key: string): string => {
  switch (key) {
    case 'emotion': return 'Smileys & Emotion';
    case 'people': return 'People & Body';
    case 'nature': return 'Animals & Nature';
    case 'food': return 'Food & Drink';
    case 'activities': return 'Activities';
    case 'places': return 'Travel & Places';
    case 'objects': return 'Objects';
    case 'symbols': return 'Symbols';
    case 'flags': return 'Flags';
    default: return '';
  }
};

const CategoryPage = React.memo(({ categoryKey, onSelect, itemWidth, isActive }: { categoryKey: string; onSelect: (emoji: string) => void; itemWidth: number; isActive: boolean }) => {
  // Lazy-load: if the page is not active or adjacent, render an empty view to save CPU/Memory on startup
  if (!isActive) {
    return <View style={{ width: itemWidth }} />;
  }

  const dataList = useMemo((): string[] => {
    const cacheKey = `emoji_cat_${categoryKey}`;
    const cached = storage.getString(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (_) {}
    }

    const nameLower = getCategoryName(categoryKey).toLowerCase();
    const filtered = emojis
      .filter(e => e.category.toLowerCase() === nameLower)
      .sort((a, b) => a.order - b.order)
      .map(e => e.emoji);

    try {
      storage.set(cacheKey, JSON.stringify(filtered));
    } catch (_) {}

    return filtered;
  }, [categoryKey]);

  return (
    <FlatList
      data={dataList}
      keyExtractor={(item, index) => `${categoryKey}-${index}`}
      numColumns={8}
      windowSize={2}
      maxToRenderPerBatch={24}
      initialNumToRender={24}
      removeClippedSubviews={true}
      showsVerticalScrollIndicator={false}
      style={{ width: itemWidth }}
      contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 16 }}
      keyboardShouldPersistTaps="handled"
      renderItem={({ item }) => (
        <Pressable
          onPress={() => onSelect(item)}
          style={{
            width: (itemWidth - 16) / 8,
            height: 48,
            alignItems: 'center',
            justifyContent: 'center',
          }}
          className="active:opacity-50"
        >
          <Text style={{ fontSize: 26 }}>{item}</Text>
        </Pressable>
      )}
    />
  );
});
CategoryPage.displayName = "CategoryPage";

export const CustomEmojiPicker = React.memo(({ onSelect, insetsBottom }: CustomEmojiPickerProps) => {
  const { width } = useWindowDimensions();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const horizontalListRef = useRef<FlatList>(null);
  const isDark = useThemeStore((state) => state.isDark);
  const colors = useThemeStore((state) => state.colors);

  const filteredSearch = useMemo(() => {
    if (!searchQuery) return [];
    const query = searchQuery.toLowerCase().trim();
    return emojis.filter(e => 
      e.name.toLowerCase().includes(query) || 
      e.keywords.some(k => k.toLowerCase().includes(query))
    );
  }, [searchQuery]);

  const handleTabPress = useCallback((index: number) => {
    setActiveIndex(index);
    horizontalListRef.current?.scrollToIndex({ index, animated: true });
  }, []);

  const handleMomentumScrollEnd = useCallback((e: any) => {
    const contentOffset = e.nativeEvent.contentOffset.x;
    const index = Math.round(contentOffset / width);
    if (index !== activeIndex && index >= 0 && index < CATEGORIES.length) {
      setActiveIndex(index);
    }
  }, [activeIndex, width]);

  const getItemLayout = useCallback((_data: any, index: number) => ({
    length: width,
    offset: width * index,
    index,
  }), [width]);

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
      {/* Search Bar */}
      <View 
        style={{
          borderBottomColor: colors.divider,
          borderBottomWidth: 1,
          backgroundColor: colors.surfaceContainerLowest,
        }}
        className="px-3 py-2 flex-row items-center gap-2"
      >
        <Icon name="search" size={20} color={colors.outline} />
        <TextInput
          placeholder="Search emoji"
          placeholderTextColor={colors.outline}
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={{
            height: 36,
            backgroundColor: colors.surfaceContainerLow,
            color: colors.onSurface,
          }}
          className="flex-1 px-3 py-1.5 rounded-full text-sm"
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => setSearchQuery('')} className="p-1">
            <Icon name="close" size={18} color={colors.outline} />
          </Pressable>
        )}
      </View>

      {searchQuery.length > 0 ? (
        // Search Results List
        <FlatList
          data={filteredSearch}
          keyExtractor={(item) => item.unified}
          numColumns={8}
          windowSize={3}
          maxToRenderPerBatch={24}
          initialNumToRender={24}
          removeClippedSubviews={true}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 16 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => onSelect(item.emoji)}
              style={{
                width: (width - 16) / 8,
                height: 48,
                alignItems: 'center',
                justifyContent: 'center',
              }}
              className="active:opacity-50"
            >
              <Text style={{ fontSize: 26 }}>{item.emoji}</Text>
            </Pressable>
          )}
        />
      ) : (
        // Category Pager List & Tabs (WhatsApp layout)
        <View className="flex-1">
          <FlatList
            ref={horizontalListRef}
            data={CATEGORIES}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={handleMomentumScrollEnd}
            keyExtractor={(item) => item.key}
            getItemLayout={getItemLayout}
            style={{ flex: 1 }}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item, index }) => {
              const isPageActive = index === activeIndex || index === activeIndex - 1 || index === activeIndex + 1;
              return (
                <CategoryPage
                  categoryKey={item.key}
                  onSelect={onSelect}
                  itemWidth={width}
                  isActive={isPageActive}
                />
              );
            }}
          />

          {/* Category Tabs at the bottom */}
          <View 
            style={{
              backgroundColor: colors.surfaceContainerLow,
              borderTopColor: colors.divider,
              borderTopWidth: 1,
            }}
            className="flex-row h-11 items-center justify-around shrink-0"
          >
            {CATEGORIES.map((cat, index) => {
              const isActive = index === activeIndex;
              return (
                <Pressable
                  key={cat.key}
                  onPress={() => handleTabPress(index)}
                  className="flex-1 items-center justify-center h-full relative"
                >
                  <Icon 
                    name={cat.icon as any} 
                    size={22} 
                    color={isActive ? colors.primary : colors.outline} 
                  />
                  {isActive && (
                    <View 
                      style={{ backgroundColor: colors.primary }}
                      className="absolute bottom-0 left-3 right-3 h-[3px] rounded-t-full" 
                    />
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
});
CustomEmojiPicker.displayName = "CustomEmojiPicker";
