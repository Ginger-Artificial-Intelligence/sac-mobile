import React, { useState, useRef } from 'react';
import {
  Modal,
  Pressable,
  View,
  ScrollView,
  StyleSheet,
  Dimensions,
  TouchableOpacity
} from 'react-native';
import { Text } from './Text';
import { Icon } from './Icon';
import { useThemeStore } from '../../store/themeStore';
import { HapticPressable } from './HapticPressable';
import { hapticFeedback } from '@/lib/utils';

export interface DropdownAction {
  label: string;
  onClick: () => void;
  icon?: string;
  channel?: string;
  phoneNumber?: string;
}

export interface NativeDropdownProps {
  expanded: boolean;
  onDismissRequest: () => void;
  onRequestOpen: () => void;
  trigger: React.ReactNode;
  actions: DropdownAction[];
  style?: any;
}

export function NativeDropdown({
  expanded,
  onDismissRequest,
  onRequestOpen,
  trigger,
  actions,
  style,
}: NativeDropdownProps) {
  const triggerRef = useRef<View>(null);
  const [dropdownPosition, setDropdownPosition] = useState({ x: 0, y: 0, width: 0 });
  const isDark = useThemeStore((state) => state.isDark);
  const colors = useThemeStore((state) => state.colors);

  const handleOpen = () => {
    if (triggerRef.current) {
      triggerRef.current.measureInWindow((x, y, width, height) => {
        setDropdownPosition({
          x: x || 0,
          y: (y || 0) + (height || 0) + 4,
          width: width || 140,
        });
        onRequestOpen();
      });
    } else {
      onRequestOpen();
    }
  };

  const screenWidth = Dimensions.get('window').width;
  const screenHeight = Dimensions.get('window').height;
  const dropdownWidth = Math.min(Math.max(dropdownPosition.width, 160), screenWidth - 32);
  const leftPos = Math.min(Math.max(dropdownPosition.x, 16), screenWidth - dropdownWidth - 16);
  const topPos = Math.min(dropdownPosition.y, screenHeight - 260);

  return (
    <View ref={triggerRef} style={style} collapsable={false}>
      <HapticPressable hapticType='light' onPress={handleOpen} style={{ width: '100%', height: '100%' }}>
        {trigger}
      </HapticPressable>

      <Modal
        visible={expanded}
        transparent
        animationType="fade"
        onRequestClose={onDismissRequest}
      >
        <Pressable style={styles.overlay} onPress={onDismissRequest}>
          <View
            style={[
              styles.menuContainer,
              {
                top: topPos,
                left: leftPos,
                width: dropdownWidth,
                backgroundColor: colors.surfaceContainerLowest,
                borderColor: colors.divider,
                shadowColor: isDark ? '#000000' : '#00326b',
              }
            ]}
          >
            <ScrollView
              style={styles.scrollView}
              keyboardShouldPersistTaps="handled"
            >
              {actions.map((action, index) => {
                let iconName: any = null;
                let iconColor = isDark ? '#8d919d' : '#5f6368';

                const channelLower = String(action.channel || '').toLowerCase();
                if (channelLower === 'whatsapp') {
                  iconName = 'chat';
                  iconColor = '#25D366'; // WhatsApp Green
                } else if (channelLower === 'messenger' || channelLower === 'facebook') {
                  iconName = 'facebook';
                  iconColor = '#0084FF'; // Messenger Blue
                } else if (channelLower === 'instagram') {
                  iconName = 'photo-camera';
                  iconColor = '#E1306C'; // Instagram Pink
                } else if (action.icon) {
                  iconName = action.icon;
                }

                return (
                  <TouchableOpacity
                    key={index}
                    onPress={() => {
                      onDismissRequest();
                      action.onClick();
                      hapticFeedback("light");
                    }}
                    style={[styles.item, { borderBottomColor: colors.divider }]}
                  >
                    <View style={styles.itemRow}>
                      {iconName && (
                        <Icon name={iconName} size={16} color={iconColor} style={{ marginRight: 8 }} />
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.itemText, { color: colors.onSurface }]} numberOfLines={1}>
                          {action.label}
                        </Text>
                        {action.phoneNumber ? (
                          <Text style={[styles.itemSubtext, { color: colors.outline }]} numberOfLines={1}>
                            {action.phoneNumber}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  menuContainer: {
    position: 'absolute',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 50, 107, 0.1)',
    shadowColor: '#00326b',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
    overflow: 'hidden',
  },
  scrollView: {
    maxHeight: 240,
  },
  item: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 50, 107, 0.05)',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemText: {
    fontSize: 14.5,
    fontWeight: '600',
    color: '#0b1c30',
  },
  itemSubtext: {
    fontSize: 12,
    color: '#737782',
    marginTop: 2,
  },
});
