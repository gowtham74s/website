import { test } from "node:test";
import assert from "node:assert/strict";
import { localDateKey, offsetMinutes, parseSamsungCsv, parseSamsungExport, parseUtc, splitCsvLine } from "../samsung.ts";

test("csv splitting with quotes", () => {
  assert.deepEqual(splitCsvLine('a,"b,c",d,'), ["a", "b,c", "d", ""]);
  assert.deepEqual(splitCsvLine('"say ""hi""",2'), ['say "hi"', "2"]);
});

test("header prefixes are stripped and metadata line skipped", () => {
  const rows = parseSamsungCsv("com.samsung.shealth.exercise,6316006,3\ncom.samsung.health.exercise.start_time,com.samsung.health.exercise.distance,time_offset,\n2026-03-01 01:00:00.000,3200,UTC+0530,\n");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].start_time, "2026-03-01 01:00:00.000");
  assert.equal(rows[0].distance, "3200");
});

test("time offsets and local dates", () => {
  assert.equal(offsetMinutes("UTC+0530"), 330);
  assert.equal(offsetMinutes("UTC-0700"), -420);
  // 20:00 UTC on 1 Mar is 01:30 on 2 Mar in India
  assert.equal(localDateKey(parseUtc("2026-03-01 20:00:00.000")!, 330), "2026-03-02");
});

test("full export: steps prefer merged source, exercises typed, sleep merged, weight per day", () => {
  const day = Date.UTC(2026, 2, 2); // midnight of the local day, epoch ms
  const files = [
    { name: "jsons/com.samsung.shealth.step_daily_trend.20260310.csv", text: `com.samsung.shealth.step_daily_trend,1,1\nday_time,count,distance,calorie,source_type,\n${day},6000,4500,200,0,\n${day},9000,6800,310,-2,\n` },
    { name: "com.samsung.shealth.exercise.20260310.csv", text: "com.samsung.shealth.exercise,1,1\ncom.samsung.health.exercise.start_time,com.samsung.health.exercise.end_time,com.samsung.health.exercise.exercise_type,com.samsung.health.exercise.duration,com.samsung.health.exercise.distance,com.samsung.health.exercise.calorie,com.samsung.health.exercise.time_offset\n2026-03-02 12:00:00.000,2026-03-02 12:45:00.000,1002,2700000,6100,420,UTC+0530\n" },
    { name: "com.samsung.shealth.sleep.20260310.csv", text: "com.samsung.shealth.sleep,1,1\ncom.samsung.health.sleep.start_time,com.samsung.health.sleep.end_time,com.samsung.health.sleep.time_offset\n2026-03-01 17:30:00.000,2026-03-01 21:00:00.000,UTC+0530\n2026-03-01 21:15:00.000,2026-03-02 01:00:00.000,UTC+0530\n" },
    { name: "com.samsung.health.weight.20260310.csv", text: "com.samsung.health.weight,1,1\nstart_time,weight,body_fat,time_offset\n2026-03-02 02:00:00.000,78.4,18.5,UTC+0530\n2026-03-02 14:00:00.000,78.9,0,UTC+0530\n" },
    { name: "com.samsung.shealth.heart_rate.20260310.csv", text: "ignored" },
  ];
  const d = parseSamsungExport(files);
  assert.equal(d.files.length, 4);
  assert.deepEqual(d.steps, [{ date: "2026-03-02", steps: 9000, distance_km: 6.8, calories: 310, active_min: 0, resting_calories: 0 }]);
  assert.equal(d.exercises[0].type, "run");
  assert.equal(d.exercises[0].duration_min, 45);
  assert.equal(d.exercises[0].distance_km, 6.1);
  assert.equal(d.sleep.length, 1);
  assert.equal(d.sleep[0].date, "2026-03-02");
  assert.equal(d.sleep[0].duration_min, 435);
  assert.equal(d.weight.length, 1);
  assert.equal(d.weight[0].weight_kg, 78.9);
});

test("real export formats: activity.day_summary + calories_burned + water, `_n` file suffixes", () => {
  const files = [
    { name: "57571a2b-com.samsung.shealth.activity.day_summary.20261128114729_3.csv", text: "﻿com.samsung.shealth.activity.day_summary,7014003,6\nstep_count,distance,calorie,active_time,deviceuuid,day_time\n5341,4060.0593,170.94998,3339438,mX,2026-11-27 00:00:00.000,\n0,0,0,0,mX,2026-11-26 00:00:00.000,\n" },
    { name: "com.samsung.shealth.calories_burned.details.20261128114729_1.csv", text: "com.samsung.shealth.calories_burned.details,7014003,4\nactive_calories_goal,com.samsung.shealth.calories_burned.rest_calorie,com.samsung.shealth.calories_burned.active_calorie,com.samsung.shealth.calories_burned.day_time\n500,2223.9045,170.94998,2026-11-27 00:00:00.000,\n" },
    { name: "com.samsung.health.water_intake.20261128114729_1.csv", text: "com.samsung.health.water_intake,7014003,6\nstart_time,amount,time_offset\n2025-07-15 20:31:32.424,250.0,UTC+0530,\n" },
    { name: "com.samsung.shealth.active_calories.goal.20261128114729_1.csv", text: "com.samsung.shealth.active_calories.goal,7014003,2\nstart_time,value,time_offset\n2025-06-30 18:36:44.447,500,UTC+0530,\n" },
    { name: "com.samsung.shealth.sleep_raw_data.20261128114729_1.csv", text: "x,1,1\na,b\n" },
  ];
  const d = parseSamsungExport(files);
  assert.deepEqual(d.steps, [{ date: "2026-11-27", steps: 5341, distance_km: 4.06, calories: 171, active_min: 56, resting_calories: 2224 }]);
  assert.deepEqual(d.water, [{ date: "2025-07-16", logged_at: "2025-07-15T20:31:32.000Z", amount_ml: 250 }]); // 20:31 UTC = 02:01 IST next day
  assert.equal(d.calorieGoal, 500);
  assert.deepEqual(d.skipped, ["com.samsung.shealth.sleep_raw_data.20261128114729_1.csv"]);
});

test("files are recognised by content even when the phone renames them", () => {
  const d = parseSamsungExport([
    { name: "document:1000123", text: "﻿com.samsung.shealth.activity.day_summary,7014003,6\nstep_count,distance,calorie,active_time,day_time\n4000,3000,120,600000,2026-11-20 00:00:00.000,\n" },
    { name: "msf_55.csv", text: "com.samsung.health.water_intake,7014003,6\nstart_time,amount,time_offset\n2026-11-20 04:00:00.000,500.0,UTC+0530,\n" },
    { name: "com.samsung.shealth.calories_burned.details.20261128114729_1 (1).csv", text: "com.samsung.shealth.calories_burned.details,7014003,4\ncom.samsung.shealth.calories_burned.rest_calorie,com.samsung.shealth.calories_burned.day_time\n2000,2026-11-20 00:00:00.000,\n" },
    { name: "notes.txt", text: "hello" },
  ]);
  assert.equal(d.steps.length, 1);
  assert.equal(d.steps[0].resting_calories, 2000);
  assert.equal(d.water.length, 1);
  assert.equal(d.files.length, 3);
  assert.deepEqual(d.skipped, []);
});
