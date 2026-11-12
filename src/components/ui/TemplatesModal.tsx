import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  View,
  Modal,
  Pressable,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useKeyboardHeight } from "../../hooks/useKeyboardHeight";
import { FlashList } from "@shopify/flash-list";
import { Image } from "expo-image";
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
  const keyboardHeight = useKeyboardHeight();
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

    // Resolve recipient phone number with multiple fallbacks
    let effectivePhone = chatPhoneNumber;
    if (!effectivePhone) {
      const chat = useSyncStore.getState().chats.find((c) => c.id === chatId);
      effectivePhone = chat?.phoneNumber || "";
    }
    if (!effectivePhone) {
      try {
        const { chatsTable } = require("../../db/schema");
        const { db } = require("../../db/client");
        const { eq } = require("drizzle-orm");
        const dbRes = await db.select().from(chatsTable).where(eq(chatsTable.id, chatId)).limit(1);
        if (dbRes.length > 0 && dbRes[0].phoneNumber) {
          effectivePhone = dbRes[0].phoneNumber;
        }
      } catch (_) { }
    }

    if (!effectivePhone) {
      Alert.alert("Missing Phone Number", "Cannot send template because this chat does not have a recipient phone number.");
      return;
    }

    // Resolve account ID / phone number ID
    let effectiveAccountId = chatAccountId;
    if (!effectiveAccountId) {
      const chat = useSyncStore.getState().chats.find((c) => c.id === chatId);
      effectiveAccountId = chat?.accountId || "";
    }
    if (!effectiveAccountId) {
      const cachedAccsStr = storage.getString("cached_social_accounts");
      if (cachedAccsStr) {
        try {
          const cachedAccs = JSON.parse(cachedAccsStr);
          const wa = cachedAccs.find((a: any) => String(a.channel).toLowerCase() === "whatsapp" && (a.phone_number_id || a.accountId || a.chatAccountId));
          if (wa) effectiveAccountId = String(wa.phone_number_id || wa.accountId || wa.chatAccountId || "");
        } catch (_) { }
      }
    }

    const payload = {
      type: "template",
      to: effectivePhone,
      display_phone_number: effectivePhone,
      phone_number: effectivePhone,
      chatId: chatId,
      channel: channel || "whatsapp",
      phone_number_id: effectiveAccountId,
      accountId: effectiveAccountId,
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
        Alert.alert("Send Failed", res?.error || res?.message || "Failed to send template message.");
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

  // ── New interface: category chips, WhatsApp-style bubble previews, live preview while filling ──
  const [categoryFilter, setCategoryFilter] = useState("ALL");

  // Only approved templates can be sent (templates without a status are kept)
  const approvedTemplates = useMemo(
    () => sortedTemplates.filter((t) => !t.status || String(t.status).toUpperCase() === "APPROVED"),
    [sortedTemplates]
  );
  const categories = useMemo(() => {
    const set = new Set<string>();
    approvedTemplates.forEach((t) => t.category && set.add(String(t.category).toUpperCase()));
    return ["ALL", ...Array.from(set)];
  }, [approvedTemplates]);
  const visibleTemplates = useMemo(
    () => (categoryFilter === "ALL" ? approvedTemplates : approvedTemplates.filter((t) => String(t.category).toUpperCase() === categoryFilter)),
    [approvedTemplates, categoryFilter]
  );

  const accent = (category?: string) => getLeftBorderClass(category || "");
  const headerComp = selectedTemplate ? (selectedTemplate.components || []).find((c: any) => c.type === "HEADER") : null;
  const bodyComp = selectedTemplate ? (selectedTemplate.components || []).find((c: any) => c.type === "BODY") : null;
  const buttonComp = selectedTemplate ? (selectedTemplate.components || []).find((c: any) => c.type === "BUTTONS") : null;
  const headerIndexes = headerComp?.format === "TEXT" ? extractPlaceholders(headerComp.text) : [];
  const bodyIndexes = bodyComp ? extractPlaceholders(bodyComp.text) : [];
  const urlVarButton = buttonComp?.buttons?.find((b: any) => b.type === "URL" && b.example);
  const hasFields = headerIndexes.length > 0 || bodyIndexes.length > 0 || !!urlVarButton || ["IMAGE", "VIDEO", "DOCUMENT", "LOCATION"].includes(headerComp?.format);

  const fieldBox = {
    backgroundColor: colors.surfaceContainerLow,
    borderColor: colors.divider,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  } as const;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.surface, paddingBottom: keyboardHeight }}>
        <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top, paddingBottom: keyboardHeight > 0 ? 0 : insets.bottom }}>
          {/* Header */}
          <View
            style={{ backgroundColor: colors.surfaceContainerLowest, borderBottomColor: colors.divider, borderBottomWidth: 1 }}
            className="flex-row items-center px-3 py-3 z-10 gap-2"
          >
            <Pressable onPress={selectedTemplate ? resetForm : onClose} className="p-2 rounded-full active:opacity-70">
              <Icon name={selectedTemplate ? "arrow-back" : "close"} size={24} color={colors.onSurface} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 17, fontWeight: "700", color: colors.onSurface }} numberOfLines={1}>
                {selectedTemplate ? selectedTemplate.name : "Send a template"}
              </Text>
              {selectedTemplate ? (
                <Text style={{ fontSize: 12, color: colors.outline }}>
                  {String(selectedTemplate.category || "Template")} · {selectedTemplate.language || ""}
                </Text>
              ) : (
                <Text style={{ fontSize: 12, color: colors.outline }}>
                  {visibleTemplates.length} approved template{visibleTemplates.length === 1 ? "" : "s"}
                </Text>
              )}
            </View>
          </View>

          {!selectedTemplate ? (
            <View className="flex-1">
              {/* Search */}
              <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surfaceContainerLow, borderRadius: 14, paddingHorizontal: 12, height: 44 }}>
                  <Icon name="search" size={20} color={colors.outline} />
                  <TextInput
                    placeholder="Search by name or text"
                    placeholderTextColor={colors.outline}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    style={{ flex: 1, color: colors.onSurface, fontSize: 15 }}
                  />
                  {searchQuery.length > 0 && (
                    <Pressable onPress={() => setSearchQuery("")} hitSlop={8}>
                      <Icon name="close" size={18} color={colors.outline} />
                    </Pressable>
                  )}
                </View>
              </View>

              {/* Category chips */}
              {categories.length > 2 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 12 }} style={{ flexGrow: 0 }}>
                  {categories.map((cat) => {
                    const on = categoryFilter === cat;
                    return (
                      <Pressable
                        key={cat}
                        onPress={() => setCategoryFilter(cat)}
                        style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: on ? colors.primary : colors.surfaceContainerLow, borderWidth: on ? 0 : 1, borderColor: colors.divider }}
                      >
                        <Text style={{ fontSize: 13, fontWeight: "600", color: on ? colors.onPrimary : colors.primary }}>
                          {cat === "ALL" ? "All" : cat.charAt(0) + cat.slice(1).toLowerCase()}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}

              {loading ? (
                <View className="flex-1 items-center justify-center">
                  <ActivityIndicator size="large" color={colors.primary} />
                </View>
              ) : visibleTemplates.length === 0 ? (
                <View className="flex-1 items-center justify-center px-6">
                  <Icon name="assignment" size={48} color={colors.outline} style={{ marginBottom: 12 }} />
                  <Text style={{ color: colors.outline, fontSize: 14, fontWeight: "500" }} className="text-center">
                    {searchQuery ? "No templates match your search" : "No approved templates found"}
                  </Text>
                </View>
              ) : (
                <FlashList
                  data={visibleTemplates}
                  keyExtractor={(item, index) => `${item.id || item.name || "tmpl"}_${item.language || ""}_${index}`}
                  contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24 }}
                  keyboardShouldPersistTaps="handled"
                  ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
                  renderItem={({ item }) => {
                    const isPinned = pinnedTemplates.includes(item.name);
                    const varCount = new Set(
                      (item.components || []).flatMap((c: any) => (c.text ? extractPlaceholders(c.text) : []))
                    ).size;
                    return (
                      <Pressable
                        onPress={() => handleSelectTemplate(item)}
                        style={{ backgroundColor: colors.surfaceContainerLowest, borderColor: colors.divider, borderWidth: 1, borderRadius: 16, padding: 14 }}
                        className="active:opacity-90"
                      >
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
                          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: accent(item.category) }} />
                          <Text style={{ flex: 1, color: colors.onSurface, fontSize: 15, fontWeight: "700" }} numberOfLines={1}>
                            {item.name}
                          </Text>
                          <View style={{ backgroundColor: getTagBgStyle(item.category), paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                            <Text style={{ color: getTagTextStyle(item.category), fontSize: 9.5, fontWeight: "800", letterSpacing: 0.4 }}>
                              {String(item.category || "TEMPLATE").toUpperCase()}
                            </Text>
                          </View>
                          <Pressable onPress={() => togglePin(item.name)} hitSlop={8} className="active:opacity-70">
                            <Icon name="push-pin" size={20} color={isPinned ? colors.primary : colors.outline} />
                          </Pressable>
                        </View>

                        <TemplateBubble template={item} headerVars={{}} bodyVars={{}} compact isDark={isDark} colors={colors} />

                        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 10, gap: 6 }}>
                          <Text style={{ color: colors.outline, fontSize: 12 }}>
                            {item.language || ""}
                            {varCount > 0 ? `  ·  ${varCount} variable${varCount === 1 ? "" : "s"}` : "  ·  No variables"}
                          </Text>
                          <View style={{ flex: 1 }} />
                          <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "700" }}>Use</Text>
                          <Icon name="chevron-right" size={18} color={colors.primary} />
                        </View>
                      </Pressable>
                    );
                  }}
                />
              )}
            </View>
          ) : (
            <View className="flex-1">
              <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">
                {/* Live preview: updates as the variables are filled in */}
                <View style={{ backgroundColor: isDark ? "#0b141a" : "#efeae2", borderRadius: 16, padding: 14 }}>
                  <Text style={{ color: colors.outline, fontSize: 11, fontWeight: "700", marginBottom: 8, letterSpacing: 0.5 }}>PREVIEW</Text>
                  <TemplateBubble
                    template={selectedTemplate}
                    headerVars={headerVarValues}
                    bodyVars={bodyVarValues}
                    localFileUri={localFileUri}
                    uploadedFileName={uploadedFileName}
                    location={{ name: locationName, address: locationAddress, hasCoords: !!(locationLatitude.trim() && locationLongitude.trim()) }}
                    isDark={isDark}
                    colors={colors}
                  />
                </View>

                {hasFields ? (
                  <View style={{ gap: 12 }}>
                    <Text style={{ color: colors.onSurface, fontSize: 16, fontWeight: "700" }}>Fill in the details</Text>

                    {["IMAGE", "VIDEO", "DOCUMENT"].includes(headerComp?.format) && (
                      <Pressable
                        onPress={() => handleFileUpload(headerComp.format)}
                        disabled={uploading}
                        style={{ ...fieldBox, borderStyle: "dashed", flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, opacity: uploading ? 0.7 : 1 }}
                      >
                        {uploading ? (
                          <ActivityIndicator size="small" color={colors.primary} />
                        ) : (
                          <Icon name={uploadedFileName ? "check-circle" : "cloud-upload"} size={28} color={uploadedFileName ? "#16a34a" : colors.primary} />
                        )}
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: colors.onSurface, fontSize: 14, fontWeight: "700" }} numberOfLines={1}>
                            {uploadedFileName ? uploadedFileName : `Choose a ${headerComp.format.toLowerCase()} for the header`}
                          </Text>
                          <Text style={{ color: colors.outline, fontSize: 12, marginTop: 2 }}>
                            {uploadedFileName ? "Tap to replace" : headerComp.format === "IMAGE" ? "Image, up to 5 MB" : headerComp.format === "VIDEO" ? "Video, up to 15 MB" : "Document"}
                          </Text>
                        </View>
                      </Pressable>
                    )}

                    {headerComp?.format === "LOCATION" && (
                      <View style={{ gap: 10 }}>
                        <View style={{ flexDirection: "row", gap: 10 }}>
                          <View style={{ flex: 1 }}>
                            <Field colors={colors} label="Latitude *" value={locationLatitude} onChange={setLocationLatitude} placeholder="12.97159" keyboardType="numbers-and-punctuation" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Field colors={colors} label="Longitude *" value={locationLongitude} onChange={setLocationLongitude} placeholder="77.59456" keyboardType="numbers-and-punctuation" />
                          </View>
                        </View>
                        <Field colors={colors} label="Place name" value={locationName} onChange={setLocationName} placeholder="Optional" />
                        <Field colors={colors} label="Address" value={locationAddress} onChange={setLocationAddress} placeholder="Optional" />
                      </View>
                    )}

                    {headerIndexes.map((idx) => (
                      <Field colors={colors}
                        key={`h${idx}`}
                        label={`Header {{${idx}}}`}
                        value={headerVarValues[idx] || ""}
                        onChange={(t) => setHeaderVarValues((prev) => ({ ...prev, [idx]: t }))}
                        placeholder={headerComp?.example?.header_text?.[idx - 1] ? `e.g. ${headerComp.example.header_text[idx - 1]}` : undefined}
                      />
                    ))}

                    {bodyIndexes.map((idx) => (
                      <Field colors={colors}
                        key={`b${idx}`}
                        label={`Body {{${idx}}}`}
                        value={bodyVarValues[idx] || ""}
                        onChange={(t) => setBodyVarValues((prev) => ({ ...prev, [idx]: t }))}
                        placeholder={bodyComp?.example?.body_text?.[0]?.[idx - 1] ? `e.g. ${bodyComp.example.body_text[0][idx - 1]}` : undefined}
                      />
                    ))}

                    {urlVarButton && (
                      <Field colors={colors}
                        label={`Link parameter (${urlVarButton.text})`}
                        value={urlButtonVarValue}
                        onChange={setUrlButtonVarValue}
                        placeholder={urlVarButton.example?.[0] ? `e.g. ${urlVarButton.example[0]}` : "e.g. promo-code-20"}
                      />
                    )}
                  </View>
                ) : (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: 12, backgroundColor: colors.surfaceContainerLow }}>
                    <Icon name="check-circle" size={22} color="#16a34a" />
                    <Text style={{ color: colors.onSurface, fontSize: 14, flex: 1 }}>This template has nothing to fill in. It is ready to send.</Text>
                  </View>
                )}
              </ScrollView>

              {/* Send */}
              <View style={{ backgroundColor: colors.surfaceContainerLowest, borderTopColor: colors.divider, borderTopWidth: 1, padding: 12 }}>
                <Pressable
                  onPress={handleSubmit}
                  disabled={submitting || uploading}
                  style={{ backgroundColor: colors.primary, opacity: submitting || uploading ? 0.6 : 1, borderRadius: 14, paddingVertical: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}
                  className="active:opacity-85"
                >
                  {submitting ? (
                    <ActivityIndicator size="small" color={colors.onPrimary} />
                  ) : (
                    <>
                      <Icon name="send" size={20} color={colors.onPrimary} />
                      <Text style={{ color: colors.onPrimary, fontSize: 16, fontWeight: "700" }}>Send template</Text>
                    </>
                  )}
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
});
TemplatesModal.displayName = "TemplatesModal";

// ─── Bubble preview (how the message looks in WhatsApp) ──────────────────────────────────────

const BUTTON_ICONS: Record<string, string> = {
  URL: "open-in-new",
  PHONE_NUMBER: "call",
  QUICK_REPLY: "reply",
  COPY_CODE: "content-copy",
  FLOW: "dynamic-form",
  OTP: "content-copy",
};

function withVariables(text: string, values: Record<number, string>, primary: string) {
  return text.split(/(\{\{\d+\}\})/g).map((part, i) => {
    const m = part.match(/^\{\{(\d+)\}\}$/);
    if (!m) return part;
    const value = values[Number(m[1])];
    if (value && value.trim()) return value;
    return (
      <Text key={i} style={{ color: primary, fontWeight: "700" }}>
        {part}
      </Text>
    );
  });
}

function TemplateBubble({
  template,
  headerVars,
  bodyVars,
  localFileUri,
  uploadedFileName,
  location,
  compact,
  isDark,
  colors,
}: {
  template: any;
  headerVars: Record<number, string>;
  bodyVars: Record<number, string>;
  localFileUri?: string;
  uploadedFileName?: string;
  location?: { name: string; address: string; hasCoords: boolean };
  compact?: boolean;
  isDark: boolean;
  colors: any;
}) {
  const comps: any[] = template?.components || [];
  const header = comps.find((c) => c.type === "HEADER");
  const body = comps.find((c) => c.type === "BODY");
  const footer = comps.find((c) => c.type === "FOOTER");
  const buttons: any[] = comps.find((c) => c.type === "BUTTONS")?.buttons || [];

  const bubbleBg = isDark ? "#005c4b" : "#d9fdd3";
  const textColor = isDark ? "#e9edef" : "#111b21";
  const muted = isDark ? "rgba(233, 237, 239, 0.6)" : "rgba(17, 27, 33, 0.55)";
  const shownButtons = compact ? buttons.slice(0, 2) : buttons;

  return (
    <View style={{ backgroundColor: bubbleBg, borderRadius: 12, borderTopRightRadius: 4, alignSelf: "stretch", overflow: "hidden" }}>
      <View style={{ padding: 10, gap: 6 }}>
        {header && header.format !== "TEXT" && (
          <View style={{ borderRadius: 8, overflow: "hidden", backgroundColor: "rgba(0,0,0,0.08)", height: compact ? 70 : 150, alignItems: "center", justifyContent: "center" }}>
            {header.format === "IMAGE" && localFileUri ? (
              <Image source={{ uri: localFileUri }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
            ) : (
              <View style={{ alignItems: "center", gap: 4 }}>
                <Icon
                  name={header.format === "IMAGE" ? "image" : header.format === "VIDEO" ? "videocam" : header.format === "LOCATION" ? "place" : "insert-drive-file"}
                  size={compact ? 26 : 40}
                  color={muted}
                />
                {!compact && (
                  <Text style={{ color: muted, fontSize: 12 }} numberOfLines={1}>
                    {header.format === "LOCATION"
                      ? location?.name || (location?.hasCoords ? "Location set" : "Location")
                      : uploadedFileName || `${String(header.format).toLowerCase()} header`}
                  </Text>
                )}
              </View>
            )}
          </View>
        )}
        {header?.format === "TEXT" && header.text ? (
          <Text style={{ color: textColor, fontWeight: "700", fontSize: 14 }}>{withVariables(header.text, headerVars, colors.primary)}</Text>
        ) : null}
        {body?.text ? (
          <Text style={{ color: textColor, fontSize: 14, lineHeight: 20 }} numberOfLines={compact ? 4 : undefined}>
            {withVariables(body.text, bodyVars, colors.primary)}
          </Text>
        ) : null}
        {footer?.text ? <Text style={{ color: muted, fontSize: 12 }}>{footer.text}</Text> : null}
      </View>

      {shownButtons.map((btn, i) => (
        <View
          key={i}
          style={{ borderTopColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)", borderTopWidth: 1, paddingVertical: compact ? 7 : 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}
        >
          <Icon name={(BUTTON_ICONS[btn.type] || "smart-button") as any} size={16} color={isDark ? "#53bdeb" : "#027eb5"} />
          <Text style={{ color: isDark ? "#53bdeb" : "#027eb5", fontSize: 14, fontWeight: "600" }}>{btn.text}</Text>
        </View>
      ))}
      {compact && buttons.length > shownButtons.length && (
        <Text style={{ color: muted, fontSize: 11, textAlign: "center", paddingBottom: 6 }}>+{buttons.length - shownButtons.length} more button{buttons.length - shownButtons.length === 1 ? "" : "s"}</Text>
      )}
    </View>
  );
}

// Defined at module level on purpose: a component declared inside another component's render is a new
// component every render, which would remount the input (and close the keyboard) on each keystroke.
function Field({
  colors,
  label,
  value,
  onChange,
  placeholder,
  keyboardType,
}: {
  colors: any;
  label: string;
  value: string;
  onChange: (t: string) => void;
  placeholder?: string;
  keyboardType?: any;
}) {
  return (
    <View
      style={{
        backgroundColor: colors.surfaceContainerLow,
        borderColor: colors.divider,
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 8,
      }}
    >
      <Text style={{ color: colors.primary, fontSize: 11, fontWeight: "700", marginBottom: 2 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder || "Enter a value"}
        placeholderTextColor={colors.outline}
        keyboardType={keyboardType}
        style={{ padding: 0, height: 24, color: colors.onSurface, fontSize: 14 }}
      />
    </View>
  );
}
