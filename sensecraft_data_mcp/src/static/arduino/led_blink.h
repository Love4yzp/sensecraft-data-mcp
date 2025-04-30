#ifndef LED_BLINK_H
#define LED_BLINK_H

#include <Arduino.h>

// led 灯的初始话函数, 希望点亮或者关闭 led 就必须main 文件的初始化时调用此函数
void ledSetup() {
    pinMode(LED_BUILTIN, OUTPUT); // 将数字引脚LED_BUILTIN作为输出
}

//
void blink(int count) {
    if (count < 1) {
        return true;
    }
    for (int counter = 0; counter < count; counter++) {
      digitalWrite(LED_BUILTIN, HIGH);
      delay(500);
      digitalWrite(LED_BUILTIN, LOW);
    }
}

#endif