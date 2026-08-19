import { hapticFeedback, HapticTopic } from "@/lib/utils";
import { Pressable, PressableProps } from "react-native"


type Props = {
    hapticType?: HapticTopic;
}

export function HapticPressable({
    onPress,
    hapticType = "light",
    ...props
}: PressableProps & Props) {
    return (
        <Pressable
            {...props}
            onPress={(event) => {
                hapticFeedback(hapticType);
                onPress?.(event);
            }}
        />
    );
}