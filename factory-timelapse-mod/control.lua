-- Factory Timelapse - control.lua
-- Captures entity build/remove events and surface snapshots for timelapse rendering.

local OUTPUT_DIR = "factory-timelapse/"

-- Entity types to skip during surface scans
local SKIP_TYPES = {
  ["character"] = true,
  ["corpse"] = true,
  ["particle-source"] = true,
  ["projectile"] = true,
  -- ["resource"] = true,  -- kept for ore patch visualization
  ["tree"] = true,
  ["simple-entity"] = true,  -- rocks, decoratives
  ["cliff"] = true,
  ["fish"] = true,
  ["fire"] = true,
  ["smoke-with-trigger"] = true,
  ["simple-entity-with-force"] = true,  -- crash site wrecks
  ["simple-entity-with-owner"] = true,
  ["explosion"] = true,
  ["flame-thrower-explosion"] = true,
  ["entity-ghost"] = true,       -- blueprint ghosts
  ["item-entity"] = true,         -- items on ground
  ["combat-robot"] = true,         -- defender/destroyer/distractor
  ["stream"] = true,               -- acid streams
  ["sticker"] = true,              -- slowdown stickers
  ["beam"] = true,                 -- laser beams
  ["smoke"] = true,
}

--- Check if entity should be skipped
local function should_skip(entity)
  if SKIP_TYPES[entity.type] then return true end
  -- Skip crash site entities
  if entity.name:find("^crash%-site") then return true end
  -- Skip acid streams and other combat effects
  if entity.name:find("%-stream") then return true end
  return false
end

--- Safely extract product name from a recipe object
local function recipe_product_name(recipe)
  if not recipe then return nil end
  -- Try products list first
  local ok, products = pcall(function() return recipe.products end)
  if ok and products and #products > 0 then
    local pok, pname = pcall(function() return products[1].name end)
    if pok and pname then return pname end
  end
  -- Fall back to recipe name
  local nok, name = pcall(function() return recipe.name end)
  if nok and name and type(name) == "string" then return name end
  return nil
end

--- Get the product name for a crafting entity (assembler, furnace, etc.)
local function get_recipe_product(entity)
  -- Try get_recipe() for assemblers, chemical plants, etc.
  local ok, recipe = pcall(function() return entity.get_recipe() end)
  if ok and recipe then
    local name = recipe_product_name(recipe)
    if name then return name end
  end

  -- Furnaces: check previous_recipe
  ok, recipe = pcall(function() return entity.previous_recipe end)
  if ok and recipe then
    local name = recipe_product_name(recipe)
    if name then return name end
  end

  -- Mining drills: check mining_target
  local mok, mname = pcall(function()
    if entity.mining_target then
      return entity.mining_target.name
    end
  end)
  if mok and mname then return mname end

  return nil
end

--- Serialize a single entity to a JSON string
local function entity_to_json(entity)
  if not entity.valid then return nil end

  local product = get_recipe_product(entity)

  -- Extra fields for specific entity types
  local extra = ""
  -- Underground belt type (input=entrance, output=exit)
  local ok, belt_type = pcall(function() return entity.belt_to_ground_type end)
  if ok and belt_type then
    extra = extra .. string.format(',"belt_type":"%s"', belt_type)
  end

  if product then
    extra = extra .. string.format(',"product":"%s"', product)
  end

  -- Rail connections: computed in preprocessor (Factorio API only provides segment endpoints, not adjacency)

  -- Belt connections: export input/output belt neighbours for proper rendering
  local belt_ok, belt_neighbours = pcall(function() return entity.belt_neighbours end)
  if belt_ok and belt_neighbours then
    local bn_parts = {}
    -- Input belts (feeding into this belt)
    if belt_neighbours.inputs then
      for _, nb in pairs(belt_neighbours.inputs) do
        if nb.valid then
          bn_parts[#bn_parts + 1] = string.format(
            '{"d":"i","x":%.2f,"y":%.2f}', nb.position.x, nb.position.y
          )
        end
      end
    end
    -- Output belt (this belt feeds into)
    if belt_neighbours.outputs then
      for _, nb in pairs(belt_neighbours.outputs) do
        if nb.valid then
          bn_parts[#bn_parts + 1] = string.format(
            '{"d":"o","x":%.2f,"y":%.2f}', nb.position.x, nb.position.y
          )
        end
      end
    end
    if #bn_parts > 0 then
      extra = extra .. ',"bn":[' .. table.concat(bn_parts, ",") .. ']'
    end
  end

  return string.format(
    '{"name":"%s","position":{"x":%.2f,"y":%.2f},"direction":%d%s}',
    entity.name,
    entity.position.x,
    entity.position.y,
    entity.direction or 0,
    extra
  )
end

--- Collect all space platform data
local function get_platforms_data()
  local platforms = {}
  -- Try to access space platforms (Space Age only)
  local ok, all_platforms = pcall(function()
    local result = {}
    for _, surface in pairs(game.surfaces) do
      -- Check if surface is a space platform
      local pok, platform = pcall(function() return surface.platform end)
      if pok and platform and platform.valid then
        local pdata = {
          name = platform.name or surface.name,
          surface = surface.name,
        }

        -- Platform state (traveling, waiting at station, etc.)
        local sok, state = pcall(function() return platform.state end)
        if sok and state then
          -- state is defines.space_platform_state
          local state_names = {
            [0] = "waiting_for_departure",
            [1] = "on_the_path",
            [2] = "waiting_at_station",
            [3] = "no_schedule",
            [4] = "no_path",
          }
          pdata.state = state_names[state] or tostring(state)
        end

        -- Current space location
        local lok, location = pcall(function() return platform.space_location end)
        if lok and location and location.valid then
          pdata.location = location.name
        end

        -- Speed
        local spok, spd = pcall(function() return platform.speed end)
        if spok and spd then
          pdata.speed = spd
        end

        -- Schedule (list of destinations)
        local schok, schedule = pcall(function() return platform.schedule end)
        if schok and schedule then
          local stops = {}
          if schedule.records then
            for _, record in pairs(schedule.records) do
              if record.station then
                stops[#stops + 1] = record.station
              end
            end
          end
          if #stops > 0 then
            pdata.schedule = stops
          end
        end

        -- Count entities on platform
        local eok, entity_count = pcall(function()
          return #surface.find_entities_filtered({force = "player"})
        end)
        if eok then
          pdata.entity_count = entity_count
        end

        result[#result + 1] = pdata
      end
    end
    return result
  end)

  if ok and all_platforms and #all_platforms > 0 then
    return all_platforms
  end
  return nil
end

--- Write player position as a JSONL line
local function write_player_position(player, tick)
  if not player.valid or not player.character then return end
  local pos = player.position
  local color = player.color
  local surface_name = player.surface.name
  local line = string.format(
    '{"tick":%d,"player":"%s","position":{"x":%.2f,"y":%.2f},"surface":"%s","color":[%.2f,%.2f,%.2f]}\n',
    tick,
    player.name,
    pos.x,
    pos.y,
    surface_name,
    color.r or 1, color.g or 1, color.b or 1
  )
  helpers.write_file(OUTPUT_DIR .. "player_positions.jsonl", line, true)
end

--- Write a build/remove event as a JSONL line
local function write_event(action, entity, tick, player_index)
  if not entity.valid then return end
  local surface_name = entity.surface.name

  -- Build extra fields
  local extra = ""
  if player_index then
    local player = game.get_player(player_index)
    if player then
      extra = extra .. string.format(',"player":"%s"', player.name)
    end
  end

  -- Add product info for built entities
  if action == "built" then
    local product = get_recipe_product(entity)
    if product then
      extra = extra .. string.format(',"product":"%s"', product)
    end
    -- Belt type
    local ok, belt_type = pcall(function() return entity.belt_to_ground_type end)
    if ok and belt_type then
      extra = extra .. string.format(',"belt_type":"%s"', belt_type)
    end
  end

  local line = string.format(
    '{"tick":%d,"action":"%s","name":"%s","position":{"x":%.2f,"y":%.2f},"direction":%d,"surface":"%s"%s}\n',
    tick,
    action,
    entity.name,
    entity.position.x,
    entity.position.y,
    entity.direction or 0,
    surface_name,
    extra
  )
  helpers.write_file(OUTPUT_DIR .. "events.jsonl", line, true)
end

--- Scan an entire surface and write all entities to a JSON file (chunked for memory safety)
local function scan_surface(surface_name, tick, filename)
  local surface = game.surfaces[surface_name]
  if not surface then
    game.print("[Timelapse] Surface '" .. surface_name .. "' not found.")
    return 0
  end

  local entities = surface.find_entities_filtered({})
  local count = 0

  -- Write header
  helpers.write_file(filename, '{"tick":' .. tick .. ',"surface":"' .. surface_name .. '","entities":[\n', false)

  local first = true
  for _, entity in pairs(entities) do
    if entity.valid and not should_skip(entity) then
      local json = entity_to_json(entity)
      if json then
        if not first then
          helpers.write_file(filename, ",\n" .. json, true)
        else
          helpers.write_file(filename, json, true)
          first = false
        end
        count = count + 1
      end
    end
  end

  -- Scan water tiles within entity bounding box (+ margin)
  -- First compute bounding box from entities
  local min_x, min_y, max_x, max_y = math.huge, math.huge, -math.huge, -math.huge
  for _, entity in pairs(entities) do
    if entity.valid then
      local pos = entity.position
      if pos.x < min_x then min_x = pos.x end
      if pos.x > max_x then max_x = pos.x end
      if pos.y < min_y then min_y = pos.y end
      if pos.y > max_y then max_y = pos.y end
    end
  end

  -- Water scanning: only if enabled and area is reasonable
  local water_tiles = {}
  local scan_water = settings.global["factory-timelapse-autoscan"].value
                  or (#game.connected_players > 0)  -- always scan in interactive mode

  if scan_water and min_x ~= math.huge then
    local margin = 32
    local bbox_area = (max_x - min_x + 2 * margin) * (max_y - min_y + 2 * margin)

    -- Skip water scan if factory is huge (>500k tiles² area) — too slow
    if bbox_area < 500000 then
      local area = {
        {min_x - margin, min_y - margin},
        {max_x + margin, max_y + margin}
      }
      local ok, tiles = pcall(function()
        return surface.find_tiles_filtered({area = area, collision_mask = "water_tile"})
      end)
      if not ok then
        ok, tiles = pcall(function()
          return surface.find_tiles_filtered({area = area, name = {
            "water", "deepwater", "water-green", "water-mud", "water-shallow",
          }})
        end)
      end
      if ok and tiles then
        -- Adaptive downsample: more tiles = bigger step
        local step = math.max(2, math.floor(#tiles / 20000))
        for i = 1, #tiles, step do
          local t = tiles[i]
          water_tiles[#water_tiles + 1] = string.format('[%.0f,%.0f]', t.position.x, t.position.y)
        end
      end
    end
  end

  -- Include player positions if any players are connected
  local players_json = ""
  for _, player in pairs(game.connected_players) do
    if player.valid and player.character then
      if players_json ~= "" then players_json = players_json .. "," end
      players_json = players_json .. string.format(
        '{"name":"%s","position":{"x":%.2f,"y":%.2f}}',
        player.name, player.position.x, player.position.y
      )
    end
  end

  -- Write closing: water, players, platforms, end
  local suffix = "\n]"
  if #water_tiles > 0 then
    suffix = suffix .. ',"water":[' .. table.concat(water_tiles, ",") .. ']'
  end
  if players_json ~= "" then
    suffix = suffix .. ',"players":[' .. players_json .. ']'
  end

  -- Add space platform data
  local platforms = get_platforms_data()
  if platforms then
    local platform_parts = {}
    for _, p in pairs(platforms) do
      local pjson = string.format('{"name":"%s","surface":"%s"', p.name, p.surface)
      if p.state then pjson = pjson .. string.format(',"state":"%s"', p.state) end
      if p.location then pjson = pjson .. string.format(',"location":"%s"', p.location) end
      if p.speed then pjson = pjson .. string.format(',"speed":%.2f', p.speed) end
      if p.entity_count then pjson = pjson .. string.format(',"entities":%d', p.entity_count) end
      if p.schedule then
        pjson = pjson .. ',"schedule":['
        for si, stop in ipairs(p.schedule) do
          if si > 1 then pjson = pjson .. ',' end
          pjson = pjson .. string.format('"%s"', stop)
        end
        pjson = pjson .. ']'
      end
      pjson = pjson .. '}'
      platform_parts[#platform_parts + 1] = pjson
    end
    if #platform_parts > 0 then
      suffix = suffix .. ',"platforms":[' .. table.concat(platform_parts, ",") .. ']'
    end
  end

  -- Surface type: is this a platform?
  local sok, is_platform = pcall(function() return surface.platform ~= nil end)
  if sok and is_platform then
    suffix = suffix .. ',"is_platform":true'
  end

  suffix = suffix .. '}\n'
  helpers.write_file(filename, suffix, true)
  return count
end

--- Get the configured surface name
local function get_surface_name()
  return settings.global["factory-timelapse-surface"].value
end

--- Check if we're in live mode
local function is_live_mode()
  return settings.global["factory-timelapse-mode"].value == "live"
end

-- Event handler for entity built
local function on_entity_built(event)
  if not is_live_mode() then return end
  if event.entity then
    write_event("built", event.entity, event.tick, event.player_index)
  end
end

-- Event handler for entity removed
local function on_entity_removed(event)
  if not is_live_mode() then return end
  if event.entity then
    write_event("removed", event.entity, event.tick, event.player_index)
  end
end

-- Register build events
script.on_event(defines.events.on_built_entity, on_entity_built)
script.on_event(defines.events.on_robot_built_entity, on_entity_built)
script.on_event(defines.events.script_raised_built, on_entity_built)

-- Register removal events
script.on_event(defines.events.on_player_mined_entity, on_entity_removed)
script.on_event(defines.events.on_robot_mined_entity, on_entity_removed)
script.on_event(defines.events.on_entity_died, on_entity_removed)
script.on_event(defines.events.script_raised_destroy, on_entity_removed)

-- Space Age DLC events (wrapped in pcall for compatibility)
pcall(function()
  script.on_event(defines.events.on_space_platform_built_entity, on_entity_built)
end)

-- Space platform lifecycle events (Space Age)
pcall(function()
  -- Platform state changes (departure, arrival, etc.)
  script.on_event(defines.events.on_space_platform_changed_state, function(event)
    if not is_live_mode() then return end
    local platform = event.platform
    if not platform or not platform.valid then return end

    local state_names = {
      [0] = "waiting_for_departure",
      [1] = "on_the_path",
      [2] = "waiting_at_station",
      [3] = "no_schedule",
      [4] = "no_path",
    }
    local state = state_names[event.new_state] or tostring(event.new_state)
    local old_state = state_names[event.old_state] or tostring(event.old_state)

    local location = ""
    local lok, loc = pcall(function() return platform.space_location end)
    if lok and loc and loc.valid then
      location = loc.name
    end

    local line = string.format(
      '{"tick":%d,"action":"platform_state","platform":"%s","state":"%s","old_state":"%s","location":"%s"}\n',
      event.tick,
      platform.name or "unknown",
      state,
      old_state,
      location
    )
    helpers.write_file(OUTPUT_DIR .. "events.jsonl", line, true)
  end)

  -- Platform pre-mined (about to be deconstructed)
  script.on_event(defines.events.on_pre_surface_deleted, function(event)
    if not is_live_mode() then return end
    local surface = game.surfaces[event.surface_index]
    if not surface then return end
    local pok, platform = pcall(function() return surface.platform end)
    if pok and platform and platform.valid then
      local line = string.format(
        '{"tick":%d,"action":"platform_deleted","platform":"%s","surface":"%s"}\n',
        event.tick,
        platform.name or "unknown",
        surface.name
      )
      helpers.write_file(OUTPUT_DIR .. "events.jsonl", line, true)
    end
  end)
end)

-- On mod init: just write session marker (baseline scanned offline via benchmark mode)
script.on_init(function()
  if is_live_mode() then
    local line = string.format('{"tick":%d,"action":"session_start","reason":"init"}\n', game.tick)
    helpers.write_file(OUTPUT_DIR .. "events.jsonl", line, true)
    game.print("[Timelapse] Live capture active. Events will be recorded.")
  end
end)

-- Log player positions + platform states every 5 seconds (300 ticks) in live mode
script.on_nth_tick(300, function(event)
  if not is_live_mode() then return end
  for _, player in pairs(game.connected_players) do
    write_player_position(player, event.tick)
  end

  -- Periodic platform state snapshot
  local platforms = get_platforms_data()
  if platforms and #platforms > 0 then
    for _, p in pairs(platforms) do
      local line = string.format(
        '{"tick":%d,"action":"platform_snapshot","platform":"%s","state":"%s","location":"%s","speed":%.2f,"entities":%d}\n',
        event.tick,
        p.name or "unknown",
        p.state or "unknown",
        p.location or "",
        p.speed or 0,
        p.entity_count or 0
      )
      helpers.write_file(OUTPUT_DIR .. "events.jsonl", line, true)
    end
  end
end)

-- First-tick handler: session marker (live mode) + auto-scan (benchmark mode)
local auto_scan_countdown = 2

script.on_event(defines.events.on_tick, function(event)
  auto_scan_countdown = auto_scan_countdown - 1
  if auto_scan_countdown > 0 then return end

  -- Write session marker for live mode (enables reload detection)
  if is_live_mode() then
    local line = string.format('{"tick":%d,"action":"session_start","reason":"load"}\n', event.tick)
    helpers.write_file(OUTPUT_DIR .. "events.jsonl", line, true)
  end

  -- Always scan on first load (handler self-unregisters after one run).
  -- Note: game.connected_players includes saved players in benchmark mode,
  -- so checking #game.connected_players == 0 is unreliable for headless detection.
  do
    local tick = game.tick
    -- Scan the configured surface (primary)
    local surface_name = get_surface_name()
    local filename = OUTPUT_DIR .. "scan_" .. tick .. ".json"
    scan_surface(surface_name, tick, filename)

    -- Also scan other surfaces that have player-built entities (Space Age planets)
    for _, surface in pairs(game.surfaces) do
      if surface.name ~= surface_name then
        local ok, player_entities = pcall(function()
          return surface.find_entities_filtered({force = "player", limit = 1})
        end)
        if ok and player_entities and #player_entities > 0 then
          local extra_filename = OUTPUT_DIR .. "scan_" .. tick .. "_" .. surface.name .. ".json"
          scan_surface(surface.name, tick, extra_filename)
        end
      end
    end
  end

  -- Unregister after scan
  script.on_event(defines.events.on_tick, nil)
end)

-- Register the /timelapse-scan command
commands.add_command("timelapse-scan", "Scan current surface and export all entities for timelapse rendering.", function(command)
  local surface_name = get_surface_name()
  local tick = game.tick
  local filename = OUTPUT_DIR .. "scan_" .. tick .. ".json"
  local count = scan_surface(surface_name, tick, filename)

  local player = game.get_player(command.player_index)
  if player then
    player.print("[Timelapse] Scan saved: " .. filename .. " (" .. count .. " entities)")
  end
end)
