import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  View,
  Modal,
  Pressable,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  KeyboardAvoidingView
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Icon } from "./Icon";
import { Text } from "./Text";
import API from "../../config/axios";
import { storage } from "../../store/mmkv";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { useSyncStore } from "../../store/syncStore";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeStore } from "../../store/themeStore";

interface TemplatesModalProps {
  visible: boolean;
  onClose: () => void;
  chatAccountId: string;
  chatPhoneNumber: string;
  chatId: string;
  channel: string;
  onSuccess: (newMessage: any) => void;
}

const extractPlaceholders = (text?: string): number[] => {
  if (!text) return [];
  const regex = /\{\{(\d+)\}\}/g;
  const matches: number[] = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    matches.push(parseInt(match[1], 10));
  }
  return Array.from(new Set(matches)).sort((a, b) => a - b);
};

export const TemplatesModal = React.memo(({
  visible,
  onClose,
  chatAccountId,
  chatPhoneNumber,
  chatId,
  channel,
  onSuccess
}: TemplatesModalProps) => {
  const insets = useSafeAreaInsets();
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<any | null>(null);

  // Pinning state
  const [pinnedTemplates, setPinnedTemplates] = useState<string[]>(() => {
    const cached = storage.getString("pinned_templates");
    return cached ? JSON.parse(cached) : [];
  });

  // Form states
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadedAssetId, setUploadedAssetId] = useState("");
  const [uploadedFileName, setUploadedFileName] = useState("");
  const [localFileUri, setLocalFileUri] = useState("");

  const [headerVarValues, setHeaderVarValues] = useState<Record<number, string>>({});
  const [bodyVarValues, setBodyVarValues] = useState<Record<number, string>>({});
  const [urlButtonVarValue, setUrlButtonVarValue] = useState("");

  // Location fields
  const [locationLatitude, setLocationLatitude] = useState("");
  const [locationLongitude, setLocationLongitude] = useState("");
  const [locationName, setLocationName] = useState("");
  const [locationAddress, setLocationAddress] = useState("");

  useEffect(() => {
    if (visible) {
      fetchTemplates();
    } else {
      resetForm();
    }
  }, [visible]);

  const fetchTemplates = async () => {
    // 1. Resolve effective phone number ID
    let effectivePhoneId = chatAccountId || "";
    const cachedAccsStr = storage.getString("cached_social_accounts");
    let cachedAccs: any[] = [];
    if (cachedAccsStr) {
      try {
        cachedAccs = JSON.parse(cachedAccsStr);
      } catch (_) { }
    }

    if (!effectivePhoneId && cachedAccs.length > 0) {
      const wa = cachedAccs.find((a: any) => String(a.channel).toLowerCase() === "whatsapp" && (a.phone_number_id || a.chatAccountId || a.accountId || a._id));
      if (wa) effectivePhoneId = String(wa.phone_number_id || wa.chatAccountId || wa.accountId || wa._id);
    }

    // 2. Try loading from MMKV local cache first
    let loadedFromCache = false;
    const cacheKeysToTry = [
      effectivePhoneId ? `templates_${effectivePhoneId}` : null,
      chatAccountId ? `templates_${chatAccountId}` : null,
      ...cachedAccs.map((a: any) => a.phone_number_id ? `templates_${a.phone_number_id}` : null),
      ...cachedAccs.map((a: any) => a.chatAccountId ? `templates_${a.chatAccountId}` : null),
      "cached_templates"
    ].filter(Boolean) as string[];

    for (const key of cacheKeysToTry) {
      const cached = storage.getString(key);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setTemplates(parsed);
            loadedFromCache = true;
            break;
          }
        } catch (_) { }
      }
    }

    if (!loadedFromCache) {
      setLoading(true);
    }

    // 3. Call backend APIs
    try {
      const params: any = { limit: 1000 };
      if (effectivePhoneId) {
        params.phone_number_id = effectivePhoneId;
      }

      let response: any;
      try {
        response = await API.get("/template", { params });
      } catch (err) {
        console.warn("API /template failed, trying /template fallback:", err);
        response = await API.get("/template/library", { params });
      }

      const rawTemplates = response.data?.templates?.data
        || response.data?.templates
        || response.data?.data
        || (Array.isArray(response.data) ? response.data : []);

      if (Array.isArray(rawTemplates) && rawTemplates.length > 0) {
        setTemplates(rawTemplates);
        if (effectivePhoneId) {
          storage.set(`templates_${effectivePhoneId}`, JSON.stringify(rawTemplates));
        }
        storage.set("cached_templates", JSON.stringify(rawTemplates));
      } else if (!loadedFromCache) {
        setTemplates([]);
      }
    } catch (e) {
      console.warn("Failed to load templates:", e);
      if (!loadedFromCache) {
        setTemplates([]);
      }
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setSelectedTemplate(null);
    setSearchQuery("");
    setUploadedAssetId("");
    setUploadedFileName("");
    setLocalFileUri("");
    setHeaderVarValues({});
    setBodyVarValues({});
    setUrlButtonVarValue("");
    setLocationLatitude("");
    setLocationLongitude("");
    setLocationName("");
    setLocationAddress("");
    setSubmitting(false);
    setUploading(false);
  };

  const togglePin = (name: string) => {
    const next = pinnedTemplates.includes(name)
      ? pinnedTemplates.filter(n => n !== name)
      : [...pinnedTemplates, name];
    setPinnedTemplates(next);
    storage.set("pinned_templates", JSON.stringify(next));
  };

  const handleSelectTemplate = (template: any) => {
    setSelectedTemplate(template);
    // Initialize variable inputs
    const headerComp = (template.components || []).find((c: any) => c.type === "HEADER");
    const bodyComp = (template.components || []).find((c: any) => c.type === "BODY");

    if (headerComp && headerComp.format === "TEXT") {
      const headerIndexes = extractPlaceholders(headerComp.text);
      const initVals: Record<number, string> = {};
      headerIndexes.forEach(idx => { initVals[idx] = ""; });
      setHeaderVarValues(initVals);
    }

    if (bodyComp) {
      const bodyIndexes = extractPlaceholders(bodyComp.text);
      const initVals: Record<number, string> = {};
      bodyIndexes.forEach(idx => { initVals[idx] = ""; });
      setBodyVarValues(initVals);
    }
  };

  const handleFileUpload = async (formatType: string) => {
    try {
      if (formatType === "IMAGE") {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
          Alert.alert("Permission Required", "Gallery permissions are needed to pick an image.");
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          quality: 1,
        });
        if (!result.canceled && result.assets && result.assets.length > 0) {
          const asset = result.assets[0];
          setLocalFileUri(asset.uri);
          await uploadToMeta(asset.uri, asset.mimeType || "image/png", asset.fileName || "image.png", "image");
        }
      } else if (formatType === "VIDEO") {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
          Alert.alert("Permission Required", "Gallery permissions are needed to pick a video.");
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["videos"],
          quality: 1,
        });
        if (!result.canceled && result.assets && result.assets.length > 0) {
          const asset = result.assets[0];
          setLocalFileUri(asset.uri);
          await uploadToMeta(asset.uri, asset.mimeType || "video/mp4", asset.fileName || "video.mp4", "video");
        }
      } else if (formatType === "DOCUMENT") {
        const result = await DocumentPicker.getDocumentAsync({
          type: "*/*",
        });
        if (!result.canceled && result.assets && result.assets.length > 0) {
          const asset = result.assets[0];
          setLocalFileUri(asset.uri);
          await uploadToMeta(asset.uri, asset.mimeType || "application/pdf", asset.name, "document");
        }
      }
    } catch (e) {
      console.warn("Picker error:", e);
      Alert.alert("Error", "Failed to select file.");
    }
  };

  const uploadToMeta = async (uri: string, mimeType: string, name: string, fieldKey: string) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append(fieldKey, {
        uri,
        type: mimeType,
        name
      } as any);

      const response = await API.post("/utils/upload-to-meta", formData, {
        params: {
          phone_number_id: chatAccountId
        },
        headers: {
          "Content-Type": "multipart/form-data"
        }
      });

      if (response.data?.status === "success" && response.data.data?.uploadAssetId) {
        setUploadedAssetId(response.data.data.uploadAssetId);
        setUploadedFileName(name);
      } else {
        throw new Error(response.data?.message || "Upload failed");
      }
    } catch (e) {
      console.warn("Meta upload failed:", e);
      Alert.alert("Upload Failed", "Failed to upload file to Meta.");
      setLocalFileUri("");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedTemplate) return;

    const headerComp = (selectedTemplate.components || []).find((c: any) => c.type === "HEADER");
    const bodyComp = (selectedTemplate.components || []).find((c: any) => c.type === "BODY");
    const buttonComp = (selectedTemplate.components || []).find((c: any) => c.type === "BUTTONS");

    // Validations
    if (headerComp) {
      if (headerComp.format === "TEXT") {
        const indexes = extractPlaceholders(headerComp.text);
        for (const idx of indexes) {
          if (!headerVarValues[idx]?.trim()) {
            Alert.alert("Required field", `Please fill out Header variable {{${idx}}}`);
            return;
          }
        }
      } else if (["IMAGE", "VIDEO", "DOCUMENT"].includes(headerComp.format)) {
        if (!uploadedAssetId) {
          Alert.alert("File Required", `Please upload a file for the Header ${headerComp.format}`);
          return;
        }
      } else if (headerComp.format === "LOCATION") {
        if (!locationLatitude.trim() || !locationLongitude.trim()) {
          Alert.alert("Coordinates Required", "Latitude and Longitude are required for Location templates.");
          return;
        }
      }
    }

    if (bodyComp) {
      const indexes = extractPlaceholders(bodyComp.text);
      for (const idx of indexes) {
        if (!bodyVarValues[idx]?.trim()) {
          Alert.alert("Required field", `Please fill out Body variable {{${idx}}}`);
          return;
        }
      }
    }

    if (buttonComp && buttonComp.buttons) {
      const hasUrlVar = buttonComp.buttons.some((b: any) => b.type === "URL" && b.example);
      if (hasUrlVar && !urlButtonVarValue.trim()) {
        Alert.alert("Required field", "Please fill out the URL Button parameter");
        return;
      }
    }

    // Build standard Meta components parameters list
    const componentsPayload: any[] = [];

    if (headerComp) {
      if (headerComp.format === "TEXT") {
        const indexes = extractPlaceholders(headerComp.text);
        if (indexes.length > 0) {
          componentsPayload.push({
            type: "header",
            parameters: indexes.map(idx => ({
              type: "text",
              text: headerVarValues[idx] || ""
            }))
          });
        }
      } else if (["IMAGE", "VIDEO", "DOCUMENT"].includes(headerComp.format)) {
        componentsPayload.push({
          type: "header",
          parameters: [{
            type: headerComp.format.toLowerCase(),
            [headerComp.format.toLowerCase()]: {
              id: uploadedAssetId,
              ...(headerComp.format === "DOCUMENT" ? { filename: uploadedFileName } : {})
            }
          }]
        });
      } else if (headerComp.format === "LOCATION") {
        componentsPayload.push({
          type: "header",
          parameters: [{
            type: "location",
            location: {
              latitude: locationLatitude.trim(),
              longitude: locationLongitude.trim(),
              name: locationName.trim() || undefined,
              address: locationAddress.trim() || undefined
            }
          }]
        });
      }
    }

    if (bodyComp) {
      const indexes = extractPlaceholders(bodyComp.text);
      if (indexes.length > 0) {
        componentsPayload.push({
          type: "body",
          parameters: indexes.map(idx => ({
            type: "text",
            text: bodyVarValues[idx] || ""
          }))
        });
      }
    }

    if (buttonComp && buttonComp.buttons) {
      buttonComp.buttons.forEach((btn: any, btnIdx: number) => {
        if (btn.type === "URL" && btn.example) {
          componentsPayload.push({
            type: "button",
            sub_type: "url",
            index: btnIdx,
            parameters: [{
              type: "text",
              text: urlButtonVarValue.trim()
            }]
          });
        }
      });
    }

    // Construct backend payload
    const { getSocket } = require("../../lib/socketConnection");
    const socket = getSocket();

    if (!socket || !socket.connected) {
      Alert.alert("Connection Error", "Socket is disconnected. Please try again.");
      return;
    }

    const userPayload = {
      clientUserID: useSyncStore.getState().userId || "",
      clientId: useSyncStore.getState().userId || "",
      name: useSyncStore.getState().userName || "",
      username: useSyncStore.getState().userName || "",
      role: useSyncStore.getState().userRole || "",
      roleName: useSyncStore.getState().userRole || "",
    };

    const payload = {
      type: "template",
      to: chatPhoneNumber,
      chatId: chatId,
      channel: channel || "whatsapp",
      phone_number_id: chatAccountId,
      accountId: chatAccountId,
      user: userPayload,
      message: {
        name: selectedTemplate.name,
        language: { code: selectedTemplate.language },
        components: componentsPayload
      }
    };

    setSubmitting(true);
    socket.emit("message:send", payload, async (res: any) => {
      setSubmitting(false);
      if (res && res.success) {
        onSuccess(res.data);
        onClose();
      } else {
        console.warn("Socket template send failed:", res);
        Alert.alert("Send Failed", res?.message || "Failed to send template message.");
      }
    });
  };

  const filteredTemplates = useMemo(() => {
    if (!searchQuery.trim()) return templates;
    const query = searchQuery.toLowerCase().trim();
    return templates.filter(t =>
      (t?.name || "").toLowerCase().includes(query) ||
      (t?.components || []).some((c: any) => c?.text && String(c.text).toLowerCase().includes(query))
    );
  }, [searchQuery, templates]);

  const sortedTemplates = useMemo(() => {
    return [...filteredTemplates].sort((a, b) => {
      const aPinned = pinnedTemplates.includes(a.name);
      const bPinned = pinnedTemplates.includes(b.name);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      return 0;
    });
  }, [filteredTemplates, pinnedTemplates]);

  const isDark = useThemeStore((state) => state.isDark);
  const colors = useThemeStore((state) => state.colors);

  const getLeftBorderClass = (category: string) => {
    switch (category?.toUpperCase()) {
      case "MARKETING": return isDark ? "#3b82f6" : "#2563eb";
      case "UTILITY": return isDark ? "#10b981" : "#059669";
      case "AUTHENTICATION": return isDark ? "#f97316" : "#ea580c";
      default: return colors.divider;
    }
  };

  const getTagBgStyle = (category: string) => {
    switch (category?.toUpperCase()) {
      case "MARKETING": return isDark ? "rgba(59, 130, 246, 0.2)" : "#eff6ff";
      case "UTILITY": return isDark ? "rgba(16, 185, 129, 0.2)" : "#ecfdf5";
      case "AUTHENTICATION": return isDark ? "rgba(249, 115, 22, 0.2)" : "#fff7ed";
      default: return colors.surfaceContainerLow;
    }
  };

  const getTagTextStyle = (category: string) => {
    switch (category?.toUpperCase()) {
      case "MARKETING": return isDark ? "#93c5fd" : "#2563eb";
      case "UTILITY": return isDark ? "#6ee7b7" : "#059669";
      case "AUTHENTICATION": return isDark ? "#fdba74" : "#ea580c";
      default: return colors.outline;
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.surface }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View
          style={{ 
            flex: 1, 
            backgroundColor: colors.surface,
            paddingTop: insets.top, 
            paddingBottom: insets.bottom 
          }}
        >

          {/* Header */}
          <View 
            style={{ 
              backgroundColor: colors.surfaceContainerLowest, 
              borderBottomColor: colors.divider, 
              borderBottomWidth: 1 
            }}
            className="flex-row items-center justify-between px-4 py-3.5 z-10"
          >
            <Text style={{ fontSize: 18, fontWeight: "700", color: colors.onSurface }}>
              {selectedTemplate ? "Send a template message" : "Templates"}
            </Text>
            <Pressable onPress={selectedTemplate ? resetForm : onClose} className="p-1 rounded-full active:opacity-70">
              <Icon name={selectedTemplate ? "arrow-back" : "close"} size={24} color={colors.onSurfaceVariant} />
            </Pressable>
          </View>

          {/* Body Content */}
          {!selectedTemplate ? (
            // LIST VIEW
            <View className="flex-1">
              {loading ? (
                <View className="flex-1 items-center justify-center">
                  <ActivityIndicator size="large" color={colors.primary} />
                </View>
              ) : sortedTemplates.length === 0 ? (
                <View className="flex-1 items-center justify-center px-6">
                  <Icon name="assignment" size={48} color={colors.outline} style={{ marginBottom: 12 }} />
                  <Text style={{ color: colors.outline, fontSize: 14, fontWeight: "500" }} className="text-center">No templates found</Text>
                </View>
              ) : (
                <FlashList
                  data={sortedTemplates}
                  keyExtractor={(item, index) => `${item.id || item.name || "tmpl"}_${item.language || ""}_${index}`}
                  contentContainerStyle={{ padding: 16, gap: 12 }}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item }) => {
                    const isPinned = pinnedTemplates.includes(item.name);
                    const bodyComp = (item.components || []).find((c: any) => c.type === "BODY");
                    const buttonsComp = (item.components || []).find((c: any) => c.type === "BUTTONS");

                    return (
                      <Pressable
                        onPress={() => handleSelectTemplate(item)}
                        style={{
                          backgroundColor: colors.surfaceContainerLowest,
                          borderColor: colors.divider,
                          borderWidth: 1,
                          borderLeftWidth: 4,
                          borderLeftColor: getLeftBorderClass(item.category),
                        }}
                        className="p-4 rounded-xl shadow-xs flex-col"
                      >
                        <View className="flex-row items-center justify-between">
                          <View className="flex-row items-center gap-2">
                            <Text style={{ color: colors.onSurface, fontSize: 14.5, fontWeight: "700" }} className="max-w-[200px]" numberOfLines={1}>
                              {item.name}
                            </Text>
                            <View 
                              style={{ backgroundColor: getTagBgStyle(item.category) }}
                              className="px-2 py-0.5 rounded"
                            >
                              <Text style={{ color: getTagTextStyle(item.category), fontSize: 9, fontWeight: "700" }} className="tracking-wider">
                                {item.category || "TEMPLATE"}
                              </Text>
                            </View>
                          </View>
                          <Pressable onPress={() => togglePin(item.name)} className="p-1 rounded-full active:opacity-70">
                            <Icon
                              name="push-pin"
                              size={18}
                              color={isPinned ? colors.primary : colors.outline}
                            />
                          </Pressable>
                        </View>

                        {bodyComp?.text && (
                          <Text style={{ color: colors.outline, fontSize: 12.5, lineHeight: 18, marginTop: 10 }} numberOfLines={4}>
                            {bodyComp.text}
                          </Text>
                        )}

                        {buttonsComp?.buttons && (
                          <View 
                            style={{ borderTopColor: colors.divider, borderTopWidth: 1 }}
                            className="flex-row flex-wrap gap-2 mt-3.5 pt-3"
                          >
                            {buttonsComp.buttons.map((btn: any, idx: number) => (
                              <View 
                                key={idx} 
                                style={{
                                  backgroundColor: colors.surfaceContainerLow,
                                  borderColor: colors.divider,
                                  borderWidth: 1,
                                }}
                                className="px-3 py-1 rounded-full"
                              >
                                <Text style={{ color: colors.onSurface, fontSize: 10.5, fontWeight: "600" }}>{btn.text}</Text>
                              </View>
                            ))}
                          </View>
                        )}
                      </Pressable>
                    );
                  }}
                />
              )}

              {/* Search Bar */}
              <View 
                style={{
                  backgroundColor: colors.surfaceContainerLowest,
                  borderTopColor: colors.divider,
                  borderTopWidth: 1,
                }}
                className="px-4 py-3 flex-row items-center gap-2"
              >
                <Icon name="search" size={20} color={colors.outline} />
                <TextInput
                  placeholder="Search templates..."
                  placeholderTextColor={colors.outline}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  style={{
                    height: 40,
                    backgroundColor: colors.surfaceContainerLow,
                    color: colors.onSurface,
                    fontSize: 14,
                  }}
                  className="flex-1 px-4 py-2 rounded-full"
                />
                {searchQuery.length > 0 && (
                  <Pressable onPress={() => setSearchQuery("")} className="p-1">
                    <Icon name="close" size={18} color={colors.outline} />
                  </Pressable>
                )}
              </View>
            </View>
          ) : (
            // FORM SUBMISSION VIEW
            <View className="flex-1">
              <ScrollView className="flex-1 px-4 py-4" keyboardShouldPersistTaps="handled">
                <Text style={{ color: colors.outline, fontSize: 12, fontWeight: "700" }} className="uppercase tracking-wider mb-4">
                  Template name: {selectedTemplate.name}
                </Text>

                {/* HEADER ELEMENT */}
                {(() => {
                  const headerComp = (selectedTemplate.components || []).find((c: any) => c.type === "HEADER");
                  if (!headerComp) return null;

                  return (
                    <View 
                      style={{
                        backgroundColor: colors.surfaceContainerLowest,
                        borderColor: colors.divider,
                        borderWidth: 1,
                      }}
                      className="p-4 rounded-xl shadow-xs mb-4"
                    >
                      <Text style={{ color: colors.onSurface, fontSize: 12.5, fontWeight: "700", marginBottom: 8 }}>
                        Header type: {headerComp.format}
                      </Text>

                      {headerComp.format === "TEXT" && (
                        <View className="gap-2">
                          <Text style={{ color: colors.outline, fontSize: 12 }} className="italic mb-2">"{headerComp.text}"</Text>
                          {extractPlaceholders(headerComp.text).map(idx => (
                            <View 
                              key={idx} 
                              style={{
                                backgroundColor: colors.surfaceContainerLow,
                                borderColor: colors.divider,
                                borderWidth: 1,
                              }}
                              className="flex-row items-center rounded-lg px-3 py-2"
                            >
                              <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "700", marginRight: 8 }}>{"{{" + idx + "}}"}</Text>
                              <TextInput
                                placeholder="Enter variable value"
                                placeholderTextColor={colors.outline}
                                value={headerVarValues[idx] || ""}
                                onChangeText={txt => setHeaderVarValues(prev => ({ ...prev, [idx]: txt }))}
                                style={{ height: 24, padding: 0, color: colors.onSurface, fontSize: 12 }}
                                className="flex-1"
                              />
                            </View>
                          ))}
                        </View>
                      )}

                      {["IMAGE", "VIDEO", "DOCUMENT"].includes(headerComp.format) && (
                        <View className="align-center items-center py-2">
                          <Pressable
                            onPress={() => handleFileUpload(headerComp.format)}
                            disabled={uploading}
                            style={{
                              backgroundColor: colors.surfaceContainerLow,
                              borderColor: colors.divider,
                              borderStyle: "dashed",
                              borderWidth: 1,
                            }}
                            className="rounded-xl p-6 align-center items-center justify-center w-full active:opacity-75"
                          >
                            {uploading ? (
                              <ActivityIndicator size="small" color={colors.primary} className="mb-2" />
                            ) : (
                              <Icon name="cloud-upload" size={32} color={colors.primary} style={{ marginBottom: 8 }} />
                            )}
                            <Text style={{ color: colors.onSurface, fontSize: 12.5, fontWeight: "700" }} className="text-center">
                              {uploadedFileName ? `Uploaded: ${uploadedFileName}` : "Upload a file"}
                            </Text>
                            <Text style={{ color: colors.outline, fontSize: 10.5, marginTop: 4 }}>
                              {headerComp.format === "IMAGE" ? "Image (max 5MB)" : headerComp.format === "VIDEO" ? "Video (max 15MB)" : "Document"}
                            </Text>
                          </Pressable>
                        </View>
                      )}

                      {headerComp.format === "LOCATION" && (
                        <View className="gap-3 mt-1">
                          <View className="flex-row gap-2">
                            <View 
                              style={{
                                backgroundColor: colors.surfaceContainerLow,
                                borderColor: colors.divider,
                                borderWidth: 1,
                              }}
                              className="flex-1 rounded-lg px-3 py-1.5"
                            >
                              <Text style={{ color: colors.outline, fontSize: 9, fontWeight: "700" }}>Latitude *</Text>
                              <TextInput
                                placeholder="e.g. 12.97159"
                                placeholderTextColor={colors.outline}
                                value={locationLatitude}
                                onChangeText={setLocationLatitude}
                                keyboardType="numeric"
                                style={{ padding: 0, height: 20, color: colors.onSurface, fontSize: 12, fontWeight: "600" }}
                                className="mt-0.5"
                              />
                            </View>
                            <View 
                              style={{
                                backgroundColor: colors.surfaceContainerLow,
                                borderColor: colors.divider,
                                borderWidth: 1,
                              }}
                              className="flex-1 rounded-lg px-3 py-1.5"
                            >
                              <Text style={{ color: colors.outline, fontSize: 9, fontWeight: "700" }}>Longitude *</Text>
                              <TextInput
                                placeholder="e.g. 77.59456"
                                placeholderTextColor={colors.outline}
                                value={locationLongitude}
                                onChangeText={setLocationLongitude}
                                keyboardType="numeric"
                                style={{ padding: 0, height: 20, color: colors.onSurface, fontSize: 12, fontWeight: "600" }}
                                className="mt-0.5"
                              />
                            </View>
                          </View>
                          <View 
                            style={{
                              backgroundColor: colors.surfaceContainerLow,
                              borderColor: colors.divider,
                              borderWidth: 1,
                            }}
                            className="rounded-lg px-3 py-1.5"
                          >
                            <Text style={{ color: colors.outline, fontSize: 9, fontWeight: "700" }}>Location Name (Optional)</Text>
                            <TextInput
                              placeholder="e.g. Aspire Medical Qatar"
                              placeholderTextColor={colors.outline}
                              value={locationName}
                              onChangeText={setLocationName}
                              style={{ padding: 0, height: 20, color: colors.onSurface, fontSize: 12, fontWeight: "600" }}
                              className="mt-0.5"
                            />
                          </View>
                          <View 
                            style={{
                              backgroundColor: colors.surfaceContainerLow,
                              borderColor: colors.divider,
                              borderWidth: 1,
                            }}
                            className="rounded-lg px-3 py-1.5"
                          >
                            <Text style={{ color: colors.outline, fontSize: 9, fontWeight: "700" }}>Location Address (Optional)</Text>
                            <TextInput
                              placeholder="e.g. Al Waab St, Doha"
                              placeholderTextColor={colors.outline}
                              value={locationAddress}
                              onChangeText={setLocationAddress}
                              style={{ padding: 0, height: 20, color: colors.onSurface, fontSize: 12, fontWeight: "600" }}
                              className="mt-0.5"
                            />
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })()}

                {/* BODY ELEMENT */}
                {(() => {
                  const bodyComp = (selectedTemplate.components || []).find((c: any) => c.type === "BODY");
                  if (!bodyComp) return null;

                  const bodyIndexes = extractPlaceholders(bodyComp.text);

                  return (
                    <View 
                      style={{
                        backgroundColor: colors.surfaceContainerLowest,
                        borderColor: colors.divider,
                        borderWidth: 1,
                      }}
                      className="p-4 rounded-xl shadow-xs mb-4"
                    >
                      <Text style={{ color: colors.onSurface, fontSize: 12.5, fontWeight: "700", marginBottom: 8 }}>Body</Text>
                      <Text style={{ color: colors.outline, fontSize: 12 }} className="italic mb-4">"{bodyComp.text}"</Text>

                      {bodyIndexes.length > 0 && (
                        <View className="gap-3">
                          {bodyIndexes.map(idx => (
                            <View 
                              key={idx} 
                              style={{
                                backgroundColor: colors.surfaceContainerLow,
                                borderColor: colors.divider,
                                borderWidth: 1,
                              }}
                              className="flex-row items-center rounded-lg px-3 py-2"
                            >
                              <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "700", marginRight: 8 }}>{"{{" + idx + "}}"}</Text>
                              <TextInput
                                placeholder="Enter variable value"
                                placeholderTextColor={colors.outline}
                                value={bodyVarValues[idx] || ""}
                                onChangeText={txt => setBodyVarValues(prev => ({ ...prev, [idx]: txt }))}
                                style={{ height: 24, padding: 0, color: colors.onSurface, fontSize: 12 }}
                                className="flex-1"
                              />
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  );
                })()}

                {/* FOOTER COMPONENT */}
                {(() => {
                  const footerComp = (selectedTemplate.components || []).find((c: any) => c.type === "FOOTER");
                  if (!footerComp) return null;

                  return (
                    <View 
                      style={{
                        backgroundColor: colors.surfaceContainerLowest,
                        borderColor: colors.divider,
                        borderWidth: 1,
                      }}
                      className="p-4 rounded-xl shadow-xs mb-4"
                    >
                      <Text style={{ color: colors.onSurface, fontSize: 12.5, fontWeight: "700", marginBottom: 4 }}>Footer</Text>
                      <Text style={{ color: colors.outline, fontSize: 12 }} className="italic">"{footerComp.text}"</Text>
                    </View>
                  );
                })()}

                {/* BUTTONS PREVIEW & VARIABLE */}
                {(() => {
                  const buttonComp = (selectedTemplate.components || []).find((c: any) => c.type === "BUTTONS");
                  if (!buttonComp || !buttonComp.buttons) return null;

                  return (
                    <View 
                      style={{
                        backgroundColor: colors.surfaceContainerLowest,
                        borderColor: colors.divider,
                        borderWidth: 1,
                      }}
                      className="p-4 rounded-xl shadow-xs mb-6"
                    >
                      <Text style={{ color: colors.onSurface, fontSize: 12.5, fontWeight: "700", marginBottom: 12 }}>Buttons</Text>

                      <View className="gap-3.5">
                        {buttonComp.buttons.map((btn: any, idx: number) => {
                          const isUrlVar = btn.type === "URL" && btn.example;

                          return (
                            <View 
                              key={idx} 
                              style={{
                                backgroundColor: colors.surfaceContainerLow,
                                borderColor: colors.divider,
                                borderWidth: 1,
                              }}
                              className="rounded-lg p-3 flex-col"
                            >
                              <Text style={{ color: colors.outline, fontSize: 10, fontWeight: "700" }} className="uppercase">
                                Type: {btn.type} {isUrlVar && "(DYNAMICAL)"}
                              </Text>
                              <View 
                                style={{
                                  backgroundColor: colors.surfaceContainerLowest,
                                  borderColor: colors.divider,
                                  borderWidth: 1,
                                }}
                                className="px-4 py-1.5 rounded-full mt-1.5 self-start shadow-xs"
                              >
                                <Text style={{ color: colors.onSurface, fontSize: 12, fontWeight: "600" }}>{btn.text}</Text>
                              </View>
                              {btn.url && (
                                <Text style={{ color: colors.primary, fontSize: 10, fontWeight: "600", marginTop: 8 }} numberOfLines={1}>
                                  Base URL: {btn.url}
                                </Text>
                              )}

                              {/* Url Var input */}
                              {isUrlVar && (
                                <View 
                                  style={{
                                    backgroundColor: colors.surfaceContainerLowest,
                                    borderColor: colors.divider,
                                    borderWidth: 1,
                                  }}
                                  className="flex-row items-center rounded-lg px-3 py-2 mt-3 shadow-xs"
                                >
                                  <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "700", marginRight: 8 }}>Parameter</Text>
                                  <TextInput
                                    placeholder="e.g. promo-code-20"
                                    placeholderTextColor={colors.outline}
                                    value={urlButtonVarValue}
                                    onChangeText={setUrlButtonVarValue}
                                    style={{ height: 24, padding: 0, color: colors.onSurface, fontSize: 12 }}
                                    className="flex-1"
                                  />
                                </View>
                              )}
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  );
                })()}
              </ScrollView>

              {/* Submit Buttons */}
              <View 
                style={{
                  backgroundColor: colors.surfaceContainerLowest,
                  borderTopColor: colors.divider,
                  borderTopWidth: 1,
                }}
                className="flex-row items-center justify-end px-4 py-3 gap-3"
              >
                <Pressable
                  onPress={resetForm}
                  disabled={submitting}
                  style={{
                    borderColor: colors.divider,
                    borderWidth: 1,
                    backgroundColor: colors.surfaceContainerLow,
                  }}
                  className="px-5 py-2.5 rounded-lg active:opacity-75"
                >
                  <Text style={{ color: colors.onSurface, fontSize: 12, fontWeight: "700" }}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={handleSubmit}
                  disabled={submitting || uploading}
                  style={{
                    backgroundColor: colors.primary,
                    opacity: (submitting || uploading) ? 0.7 : 1,
                  }}
                  className="px-6 py-2.5 rounded-lg items-center justify-center shadow-md active:opacity-85 min-w-[90px]"
                >
                  {submitting ? (
                    <ActivityIndicator size="small" color={colors.onPrimary} />
                  ) : (
                    <Text style={{ color: colors.onPrimary, fontSize: 12, fontWeight: "700" }}>Submit</Text>
                  )}
                </Pressable>
              </View>
            </View>
          )}

        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
});
TemplatesModal.displayName = "TemplatesModal";
