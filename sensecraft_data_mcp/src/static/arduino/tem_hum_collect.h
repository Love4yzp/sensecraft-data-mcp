#ifndef TEM_HUM_COLLECT_H
#define TEM_HUM_COLLECT_H

#include <ArduinoJson.h>

// 获取当前环境的温湿度代码, 以JsonDocument格式返回
JsonDocument tem_hum_collect() {
    // 读取温度和湿度传感器数据
    float temperature = 11.1;
    float humidity = 99.9;
    JsonDocument doc;
    doc["temperature"] = temperature;
    doc["humidty"] = humidity;
    return doc;
}

#endif