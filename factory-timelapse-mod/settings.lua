data:extend({
  {
    type = "string-setting",
    name = "factory-timelapse-surface",
    setting_type = "runtime-global",
    default_value = "nauvis",
    order = "a"
  },
  {
    type = "string-setting",
    name = "factory-timelapse-mode",
    setting_type = "runtime-global",
    default_value = "live",
    allowed_values = {"live", "scan-only"},
    order = "b"
  },
  {
    type = "bool-setting",
    name = "factory-timelapse-autoscan",
    setting_type = "runtime-global",
    default_value = false,
    order = "c"
  }
})
