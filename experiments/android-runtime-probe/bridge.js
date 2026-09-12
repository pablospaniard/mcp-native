// Fixed app-owned source. Server data arrives only as message-port strings.
(async () => {
  const port = await android.getNamedPort("mcp-native-probe");
  port.onmessage = ({ data }) => port.postMessage(NativeExperiment.exchange(data));
  return "ready";
})();
