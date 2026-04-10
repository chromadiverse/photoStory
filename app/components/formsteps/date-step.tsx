import React, { useState, useEffect } from "react";
import { FormField, FormItem, FormLabel, FormControl, FormMessage, FormDescription } from "../ui/form";
import { Input } from "../ui/input"; 
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { UseFormReturn } from "react-hook-form";
import { GalleryMetadataFormData } from "@/app/types/gallery-schema"; 
import { MONTHS,DECADES } from "@/app/lib/constants/gallery-constants";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface DateSectionProps {
  form: UseFormReturn<GalleryMetadataFormData>;
  dateKnowledge: "exact" | "approximate";
  onAutoSave: () => void;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const getDaysInMonth = (month: number, year: number) => {
  return new Date(year, month + 1, 0).getDate();
};

const getFirstDayOfMonth = (month: number, year: number) => {
  return new Date(year, month, 1).getDay();
};

export const DateSection: React.FC<DateSectionProps> = ({ form, dateKnowledge, onAutoSave }) => {
  const [month, setMonth] = useState("");
  const [day, setDay] = useState("");
  const [year, setYear] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());

  // Parse the exact date from form when component mounts or dateExact changes
  useEffect(() => {
    const exactDate = form.watch("dateExact");
    if (exactDate) {
      // Parse the date string manually to avoid timezone issues
      const [yearStr, monthStr, dayStr] = exactDate.split("-");
      setMonth(monthStr);
      setDay(dayStr);
      setYear(yearStr);
      setCalendarMonth(parseInt(monthStr) - 1);
      setCalendarYear(parseInt(yearStr));
    }
  }, [form.watch("dateExact")]);

  // Update calendar when user types
  useEffect(() => {
    const monthNum = parseInt(month);
    const yearNum = parseInt(year);

    if (monthNum >= 1 && monthNum <= 12) {
      setCalendarMonth(monthNum - 1);
    }

    if (yearNum >= 1800 && yearNum <= 2099) {
      setCalendarYear(yearNum);
    }
  }, [month, year]);

  const handleDateInputChange = (field: "month" | "day" | "year", value: string) => {
    // Only allow numbers
    const numericValue = value.replace(/\D/g, "");

    if (field === "month") {
      const limitedValue = numericValue.slice(0, 2);
      setMonth(limitedValue);
      updateFormDate(limitedValue, day, year);
    } else if (field === "day") {
      const limitedValue = numericValue.slice(0, 2);
      setDay(limitedValue);
      updateFormDate(month, limitedValue, year);
    } else if (field === "year") {
      const limitedValue = numericValue.slice(0, 4);
      setYear(limitedValue);
      updateFormDate(month, day, limitedValue);
    }
  };

  const updateFormDate = (m: string, d: string, y: string) => {
    const monthNum = parseInt(m);
    const dayNum = parseInt(d);
    const yearNum = parseInt(y);

    // Validate and update form only if we have valid values
    if (
      monthNum >= 1 && monthNum <= 12 &&
      dayNum >= 1 && dayNum <= 31 &&
      yearNum >= 1800 && yearNum <= 2099
    ) {
      const dateString = `${y.padStart(4, "0")}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
      form.setValue("dateExact", dateString);
      onAutoSave();
    }
  };

  const handleCalendarDayClick = (selectedDay: number) => {
    const newDay = String(selectedDay).padStart(2, "0");
    const newMonth = String(calendarMonth + 1).padStart(2, "0");
    const newYear = String(calendarYear);

    setDay(newDay);
    setMonth(newMonth);
    setYear(newYear);

    const dateString = `${newYear}-${newMonth}-${newDay}`;
    form.setValue("dateExact", dateString);
    onAutoSave();
    form.trigger("dateExact");
  };

  const navigateMonth = (direction: "prev" | "next") => {
    if (direction === "prev") {
      if (calendarMonth === 0) {
        setCalendarMonth(11);
        setCalendarYear(calendarYear - 1);
      } else {
        setCalendarMonth(calendarMonth - 1);
      }
    } else {
      if (calendarMonth === 11) {
        setCalendarMonth(0);
        setCalendarYear(calendarYear + 1);
      } else {
        setCalendarMonth(calendarMonth + 1);
      }
    }
  };

  const renderCalendar = () => {
    const daysInMonth = getDaysInMonth(calendarMonth, calendarYear);
    const firstDay = getFirstDayOfMonth(calendarMonth, calendarYear);
    const days = [];

    // Empty cells for days before the first day of month
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="h-6" />);
    }

    // Days of the month
    const selectedDay = parseInt(day);
    const selectedMonth = parseInt(month) - 1;
    const selectedYear = parseInt(year);

    for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
      const isSelected = dayNum === selectedDay && 
                        calendarMonth === selectedMonth && 
                        calendarYear === selectedYear;
      const isToday = dayNum === new Date().getDate() && 
                     calendarMonth === new Date().getMonth() && 
                     calendarYear === new Date().getFullYear();

      days.push(
        <button
          key={dayNum}
          type="button"
          onClick={() => handleCalendarDayClick(dayNum)}
          className={`h-6 w-6 rounded text-xs hover:bg-blue-100 transition-colors
            ${isSelected ? "bg-blue-500 text-white hover:bg-blue-600" : ""}
            ${isToday && !isSelected ? "border border-blue-500" : ""}
          `}
        >
          {dayNum}
        </button>
      );
    }

    return days;
  };

  if (!dateKnowledge) return null;

  return (
    <div className="space-y-4 p-4 border rounded-lg bg-gray-50">
      <div className="flex items-center gap-2">
        <h3 className="font-medium">Date Information</h3>
        <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded">Required</span>
      </div>
      
      {dateKnowledge === "exact" ? (
        <FormField
          control={form.control}
          name="dateExact"
          render={({ field, fieldState }) => (
            <FormItem>
              <FormLabel className={fieldState.error ? "text-red-600 font-medium" : ""}>
                Date <span className="text-red-500">*</span>
              </FormLabel>
              <FormControl>
                <div className="space-y-4">
                  {/* Date Input Fields */}
                  <div className="flex gap-2 items-center">
                    <Input
                      type="text"
                      placeholder="MM"
                      value={month}
                      onChange={(e) => handleDateInputChange("month", e.target.value)}
                      onBlur={() => form.trigger("dateExact")}
                      className={`w-16 text-center ${fieldState.error ? "border-red-500" : ""}`}
                      maxLength={2}
                    />
                    <span className="text-gray-500">/</span>
                    <Input
                      type="text"
                      placeholder="DD"
                      value={day}
                      onChange={(e) => handleDateInputChange("day", e.target.value)}
                      onBlur={() => form.trigger("dateExact")}
                      className={`w-16 text-center ${fieldState.error ? "border-red-500" : ""}`}
                      maxLength={2}
                    />
                    <span className="text-gray-500">/</span>
                    <Input
                      type="text"
                      placeholder="YYYY"
                      value={year}
                      onChange={(e) => handleDateInputChange("year", e.target.value)}
                      onBlur={() => form.trigger("dateExact")}
                      className={`w-24 text-center ${fieldState.error ? "border-red-500" : ""}`}
                      maxLength={4}
                    />
                  </div>

                  {/* Calendar Display */}
                  <div className="border rounded-lg bg-white p-2 shadow-sm max-w-xs">
                    {/* Calendar Header */}
                    <div className="flex items-center justify-between mb-2">
                      <button
                        type="button"
                        onClick={() => navigateMonth("prev")}
                        className="p-0.5 hover:bg-gray-100 rounded"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <div className="font-semibold text-sm">
                        {MONTH_NAMES[calendarMonth]} {calendarYear}
                      </div>
                      <button
                        type="button"
                        onClick={() => navigateMonth("next")}
                        className="p-0.5 hover:bg-gray-100 rounded"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Day Labels */}
                    <div className="grid grid-cols-7 gap-0.5 mb-1">
                      {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
                        <div key={day} className="h-6 flex items-center justify-center text-[10px] font-medium text-gray-600">
                          {day}
                        </div>
                      ))}
                    </div>

                    {/* Calendar Days */}
                    <div className="grid grid-cols-7 gap-0.5">
                      {renderCalendar()}
                    </div>
                  </div>
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Fill out at least one field below</p>
          
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="dateMonth"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel className={fieldState.error ? "text-red-600 font-medium" : ""}>
                    Month
                  </FormLabel>
                  <Select 
                    onValueChange={(value) => {
                      field.onChange(value);
                      onAutoSave();
                      form.trigger("dateMonth");
                    }} 
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger className={fieldState.error ? "border-red-500" : ""}>
                        <SelectValue placeholder="Select month" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="z-[60]">
                      {MONTHS.map((month) => (
                        <SelectItem key={month} value={month}>
                          {month}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="dateDay"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel className={fieldState.error ? "text-red-600 font-medium" : ""}>
                    Day
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="1"
                      max="31"
                      placeholder="DD"
                      {...field}
                      onBlur={() => {
                        onAutoSave();
                        form.trigger("dateDay");
                      }}
                      className={fieldState.error ? "border-red-500" : ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="dateYear"
            render={({ field, fieldState }) => (
              <FormItem>
                <FormLabel className={fieldState.error ? "text-red-600 font-medium" : ""}>
                  Year
                </FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    placeholder="YYYY"
                    min="1800"
                    max="2099"
                    {...field}
                    onBlur={() => {
                      onAutoSave();
                      form.trigger("dateYear");
                    }}
                    disabled={!!form.watch("dateDecade")}
                    className={fieldState.error ? "border-red-500" : ""}
                  />
                </FormControl>
                <FormDescription>Year and Decade are mutually exclusive</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="dateDecade"
            render={({ field, fieldState }) => (
              <FormItem>
                <FormLabel className={fieldState.error ? "text-red-600 font-medium" : ""}>
                  Decade
                </FormLabel>
                <Select
                  onValueChange={(value) => {
                    field.onChange(value);
                    onAutoSave();
                    form.trigger("dateDecade");
                  }}
                  value={field.value}
                  disabled={!!form.watch("dateYear")}
                >
                  <FormControl>
                    <SelectTrigger className={fieldState.error ? "border-red-500" : ""}>
                      <SelectValue placeholder="Select decade" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="z-[60] max-h-60">
                    {DECADES.map((decade) => (
                      <SelectItem key={decade} value={decade}>
                        {decade}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>Year and Decade are mutually exclusive</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      )}
    </div>
  );
};