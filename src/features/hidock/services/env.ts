export function isLikelySafariOrIOS(): boolean {
  if (typeof navigator === "undefined") return false
  const ua = navigator.userAgent.toLowerCase()
  const isSafari =
    ua.includes("safari") && !ua.includes("chrome") && !ua.includes("chromium") && !ua.includes("edg")
  const isIOS = /iphone|ipad|ipod/.test(ua)
  return isSafari || isIOS
}
