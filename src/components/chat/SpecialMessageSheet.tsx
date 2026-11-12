import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, TextInput, View } from "react-native";
import { useKeyboardHeight } from "../../hooks/useKeyboardHeight";
import { Text } from "../ui/Text";
import { Icon } from "../ui/Icon";
import { useThemeStore } from "../../store/themeStore";
import type { SpecialMessage } from "../../store/syncStore";

export type SpecialMode = "location" | "requestLocation" | "requestAddress";

const TITLES: Record<SpecialMode, string> = {
  location: "Send location",
  requestLocation: "Request location",
  requestAddress: "Request address",
};

// WhatsApp address requests only support these countries
const COUNTRIES = [
  { code: "IN", label: "India" },
  { code: "SG", label: "Singapore" },
];

/** Pull coordinates out of a pasted map link or "lat, lng" text (same rules as the web form) */
export function parseCoordinates(text: string): { lat: string; lng: string } | null {
  const at = text.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  const query = text.match(/[?&](?:q|ll|query)=(-?\d+\.\d+),(-?\d+\.\d+)/);
  const raw = text.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
  const m = at || query || raw;
  return m ? { lat: m[1], lng: m[2] } : null;
}

export function SpecialMessageSheet({
  mode,
  onClose,
  onSubmit,
}: {
  mode: SpecialMode | null;
  onClose: () => void;
  onSubmit: (spec: SpecialMessage) => void;
}) {
  const colors = useThemeStore((s) => s.colors);
  const keyboardHeight = useKeyboardHeight();
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [link, setLink] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [country, setCountry] = useState("IN");
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (!mode) return;
    setLat("");
    setLng("");
    setName("");
    setAddress("");
    setLink("");
    setCountry("IN");
    setBodyText(
      mode === "requestLocation"
        ? "Please share your location so we can help you."
        : mode === "requestAddress"
          ? "Please share your delivery address."
          : ""
    );
  }, [mode]);

  const useMyLocation = async () => {
    setLocating(true);
    try {
      // Loaded lazily: a build made before expo-location was added still runs (this button then explains)
      const Location = require("expo-location");
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Location needed", "Allow location access in your phone settings, or enter the coordinates by hand.");
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setLat(pos.coords.latitude.toFixed(6));
      setLng(pos.coords.longitude.toFixed(6));
    } catch (e) {
      console.warn("[location] failed:", e);
      Alert.alert("Could not get your location", "Make sure location is on and the app is rebuilt with the location module, or enter the coordinates by hand.");
    } finally {
      setLocating(false);
    }
  };

  const onPasteLink = (text: string) => {
    setLink(text);
    const parsed = parseCoordinates(text);
    if (parsed) {
      setLat(parsed.lat);
      setLng(parsed.lng);
    }
  };

  const submit = () => {
    if (mode === "location") {
      const la = Number(lat.trim());
      const lo = Number(lng.trim());
      if (!lat.trim() || !lng.trim() || Number.isNaN(la) || Number.isNaN(lo)) {
        Alert.alert("Coordinates needed", "Enter a valid latitude and longitude, or use your current location.");
        return;
      }
      if (Math.abs(la) > 90 || Math.abs(lo) > 180) {
        Alert.alert("Check the coordinates", "Latitude must be between -90 and 90, and longitude between -180 and 180.");
        return;
      }
      onSubmit({
        type: "location",
        label: "📍 Location",
        message: { location: { latitude: la, longitude: lo, ...(name.trim() ? { name: name.trim() } : {}), ...(address.trim() ? { address: address.trim() } : {}) } },
      });
    } else if (mode === "requestLocation") {
      if (!bodyText.trim()) return Alert.alert("Message needed", "Write the message that asks for the location.");
      onSubmit({
        type: "interactive",
        label: "📍 Location request",
        message: { type: "location_request_message", body: { text: bodyText.trim() }, action: { name: "send_location" } },
      });
    } else if (mode === "requestAddress") {
      if (!bodyText.trim()) return Alert.alert("Message needed", "Write the message that asks for the address.");
      onSubmit({
        type: "interactive",
        label: "🏠 Address request",
        message: { type: "address_message", body: { text: bodyText.trim() }, action: { name: "address_message", parameters: { country } } },
      });
    }
  };

  const input = { backgroundColor: colors.surfaceContainerLow, borderColor: colors.divider, borderWidth: 1, borderRadius: 10, color: colors.onSurface, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 } as const;
  const label = { fontSize: 13, color: colors.outline, marginBottom: 4 } as const;

  return (
    <Modal visible={mode !== null} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, paddingBottom: keyboardHeight }}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)" }} onPress={onClose} />
        <View style={{ backgroundColor: colors.surfaceContainerLowest, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "88%" }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16 }}>
            <Text style={{ fontSize: 17, fontWeight: "700", color: colors.onSurface }}>{mode ? TITLES[mode] : ""}</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Icon name="close" size={22} color={colors.outline} />
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 28, gap: 14 }}>
            {mode === "location" && (
              <>
                <Pressable
                  onPress={useMyLocation}
                  disabled={locating}
                  style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.primary, opacity: locating ? 0.6 : 1 }}
                >
                  {locating ? <ActivityIndicator size="small" color={colors.primary} /> : <Icon name="my-location" size={20} color={colors.primary} />}
                  <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 15 }}>Use my current location</Text>
                </Pressable>

                <View>
                  <Text style={label}>Or paste a map link / coordinates</Text>
                  <TextInput value={link} onChangeText={onPasteLink} placeholder="https://maps.google.com/…@12.97,77.59  or  12.97, 77.59" placeholderTextColor={colors.outline} style={input} autoCapitalize="none" />
                </View>

                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={label}>Latitude</Text>
                    <TextInput value={lat} onChangeText={setLat} keyboardType="numbers-and-punctuation" placeholder="12.971590" placeholderTextColor={colors.outline} style={input} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={label}>Longitude</Text>
                    <TextInput value={lng} onChangeText={setLng} keyboardType="numbers-and-punctuation" placeholder="77.594560" placeholderTextColor={colors.outline} style={input} />
                  </View>
                </View>

                <View>
                  <Text style={label}>Place name (optional)</Text>
                  <TextInput value={name} onChangeText={setName} placeholder="e.g. Our store" placeholderTextColor={colors.outline} style={input} />
                </View>
                <View>
                  <Text style={label}>Address (optional)</Text>
                  <TextInput value={address} onChangeText={setAddress} placeholder="e.g. 12 MG Road, Bengaluru" placeholderTextColor={colors.outline} style={input} />
                </View>
              </>
            )}

            {(mode === "requestLocation" || mode === "requestAddress") && (
              <>
                <Text style={{ color: colors.outline, fontSize: 13 }}>
                  {mode === "requestLocation"
                    ? "The customer gets this message with a button to share their location."
                    : "The customer gets this message with a button to fill in their address."}
                </Text>
                <View>
                  <Text style={label}>Message</Text>
                  <TextInput value={bodyText} onChangeText={setBodyText} multiline style={{ ...input, minHeight: 80, textAlignVertical: "top" }} placeholderTextColor={colors.outline} />
                </View>
              </>
            )}

            {mode === "requestAddress" && (
              <View>
                <Text style={label}>Country</Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {COUNTRIES.map((c) => {
                    const on = country === c.code;
                    return (
                      <Pressable
                        key={c.code}
                        onPress={() => setCountry(c.code)}
                        style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: on ? colors.primary : colors.surfaceContainerLow, borderWidth: on ? 0 : 1, borderColor: colors.divider }}
                      >
                        <Text style={{ color: on ? colors.onPrimary : colors.primary, fontWeight: "600" }}>{c.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={{ color: colors.outline, fontSize: 12, marginTop: 6 }}>WhatsApp address requests work for India and Singapore only.</Text>
              </View>
            )}

            <Pressable onPress={submit} style={{ backgroundColor: colors.primary, paddingVertical: 13, borderRadius: 12, alignItems: "center" }}>
              <Text style={{ color: colors.onPrimary, fontWeight: "700", fontSize: 15 }}>Send</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
