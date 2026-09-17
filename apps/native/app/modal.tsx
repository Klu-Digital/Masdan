import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Button, Surface, useThemeColor } from "heroui-native";
import { Text, View } from "react-native";

import { Container } from "@/components/container";

const handleClose = () => {
  router.back();
};

const Modal = () => {
  const accentForegroundColor = useThemeColor("accent-foreground");

  return (
    <Container>
      <View className="flex-1 items-center justify-center p-4">
        <Surface variant="secondary" className="w-full max-w-sm rounded-lg p-5">
          <View className="items-center">
            <View className="bg-accent mb-3 h-12 w-12 items-center justify-center rounded-lg">
              <Ionicons
                name="checkmark"
                size={24}
                color={accentForegroundColor}
              />
            </View>
            <Text className="text-foreground mb-1 text-lg font-medium">
              Modal Screen
            </Text>
            <Text className="text-muted mb-4 text-center text-sm">
              This is an example modal screen for dialogs and confirmations.
            </Text>
          </View>
          <Button onPress={handleClose} className="w-full" size="sm">
            <Button.Label>Close</Button.Label>
          </Button>
        </Surface>
      </View>
    </Container>
  );
};

export default Modal;
