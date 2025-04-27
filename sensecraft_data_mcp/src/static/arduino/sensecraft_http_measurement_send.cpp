#ifndef HTTP_CLIENT_H
#define HTTP_CLIENT_H

#include <Arduino.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include "config.h" // 包含sensecraft data(sensecap paas)的配置

// 向sensecraft data(sensecap paas)发送传感器测量结果的代码,接收参数为StaticJsonDocument
bool sensecraft_http_measurement_send(StaticJsonDocument doc) {
    if (!WiFi.isConnected()) {
        Serial.println("WiFi not connected!");
        return false;
    }

    HTTPClient http;
    http.begin(SENSECRAFT_DATA_DEVICE_MEASUREMENT_UPLINK_URL);
    
    http.addHeader("Content-Type", "application/json");
    http.addHeader("authorization", SENSECAP_PAAS_DEVICE_API_KEY);

    String payload;
    serializeJson(doc, payload);

    int httpResponseCode = http.POST(payload);

    if (httpResponseCode > 0) {
        String response = http.getString();
        Serial.printf("HTTP Response code: %d\n", httpResponseCode);
        Serial.printf("Response: %s\n", response.c_str());
        http.end();
        return true;
    } else {
        Serial.printf("Error on sending POST: %d\n", httpResponseCode);
        http.end();
        return false;
    }
}

#endif // HTTP_CLIENT_H 