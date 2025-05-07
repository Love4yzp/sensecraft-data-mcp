#include <Arduino.h>
#include <WiFi.h>

#include "config.h" // 配置文件，包含WiFi信息和SenseCraft data平台的信息

// 上传数据的时间间隔（毫秒）
const unsigned long UPLOAD_INTERVAL = 60000; // 1分钟
unsigned long lastUploadTime = 0;

// 项目的初始化的内容
void setup() {
  Serial.begin(115200);
  delay(3000);
  Serial.println("Starting...");

  // 连接WiFi
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(1000);
    Serial.print("WiFi is connecting.\n");
  }
  Serial.println();
  Serial.println("WiFi connected");
  Serial.print("IP address: ");
  Serial.println(WiFi.localIP());
}

// 主循环函数: 设备运行时，会一直执行此函数
void loop() {
  unsigned long currentTime = millis();

  // 检查是否到了上传数据的时间
  if (currentTime - lastUploadTime >= UPLOAD_INTERVAL) {
    lastUploadTime = currentTime;

    // 输出日志的操作, 完成重要步骤后必须输出日志记录
    Serial.println("loop...");

    long rssi = WiFi.RSSI();
    Serial.print("RSSI: ");
    Serial.print(rssi);
    Serial.println(" dBm");

    // 请在此调用你需要的函数, 请注意,如果需要,就在文件最上方添加导入的文件声明

  }

  // 延时一段时间，避免过于频繁的读取
  delay(1000);
}
