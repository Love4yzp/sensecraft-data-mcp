#ifndef SENSECRAFT_HTTP_MEASUREMENT_SEND_H
#define SENSECRAFT_HTTP_MEASUREMENT_SEND_H

#include <Arduino.h>
#include <HTTPClient.h>
#include "config.h" // 包含sensecraft data的配置

// 向sensecraft data发送传感器测量结果的代码,接收参数为JsonDocument, 返回值true 表示数据发送成功, false 表示数据发送失败
bool sensecraft_http_measurement_send(JsonDocument doc) {
    if (!WiFi.isConnected()) {
        Serial.println("WiFi not connected!");
        return false;
    }

    HTTPClient http;
    http.begin(SENSECRAFT_DATA_DEVICE_MEASUREMENT_UPLINK_URL);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("authorization", SENSECRAFT_DATA_DEVICE_TOKEN);

    String payload;
    serializeJson(doc, payload);
    int httpResponseCode = http.POST(payload);
    if (httpResponseCode >= 400) {
        Serial.printf("Error on sending POST: %d\n", httpResponseCode);
        http.end();
        return false;
    }
    String response = http.getString();
    Serial.printf("HTTP Response code: %d\n", httpResponseCode);
    Serial.printf("Response: %s\n", response.c_str());
    JsonDocument result;
    deserializeJson(result, response.c_str());
    http.end();
    if (result["code"] == "0") {
        return true;
    }
    return false;
}

#endif