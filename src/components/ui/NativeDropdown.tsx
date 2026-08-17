import React from 'react';
import { Platform, Pressable, View } from 'react-native';
import { Text } from './Text';

export interface DropdownAction {
  label: string;
  onClick: () => void;
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
  if (Platform.OS === 'android') {
    const { DropdownMenu, DropdownMenuItem, Host } = require('@expo/ui/jetpack-compose');
    return (
      <Host style={style} seedColor="#00326b">
        <DropdownMenu
          expanded={expanded}
          onDismissRequest={onDismissRequest}
          style={{ width: '100%', height: '100%' }}
          color="#eff4ff"
        >
          <DropdownMenu.Trigger>
            <Pressable onPress={onRequestOpen} style={{ width: '100%', height: '100%' }}>
              {trigger}
            </Pressable>
          </DropdownMenu.Trigger>
          <DropdownMenu.Items>
            {actions.map((action, index) => (
              <DropdownMenuItem 
                key={index} 
                onClick={() => {
                  onDismissRequest();
                  action.onClick();
                }}
                elementColors={{
                  textColor: "#0b1c30",
                  leadingIconColor: "#00326b",
                }}
              >
                <DropdownMenuItem.Text><Text>{action.label}</Text></DropdownMenuItem.Text>
              </DropdownMenuItem>
            ))}
          </DropdownMenu.Items>
        </DropdownMenu>
      </Host>
    );
  } else if (Platform.OS === 'ios') {
    const { Menu, Button, Host } = require('@expo/ui/swift-ui');
    return (
      <Host style={style} seedColor="#00326b">
        <Menu 
          label={trigger}
          style={{ width: '100%', height: '100%' }}
        >
          {actions.map((action, index) => (
            <Button
              key={index}
              onPress={() => {
                onDismissRequest();
                action.onClick();
              }}
              label={action.label}
            />
          ))}
        </Menu>
      </Host>
    );
  } else {
    // Web/fallback using simple Pressable
    return (
      <View style={style}>
        <Pressable onPress={onRequestOpen}>
          {trigger}
        </Pressable>
      </View>
    );
  }
}
