# Spec.md Update (V1.1)

## Changes for `/record dd-mm`

### 1. Goals (Section 1.6)

Add:

-   Allow the user to view the details of a specific workday using
    `/record dd-mm`.

------------------------------------------------------------------------

## 2.10 Record Lookup

The user must be able to view the details of a specific date using:

``` txt
/record dd-mm
```

Example:

``` txt
/record 12-06
```

The year is not required because the bot works with the current year.

The bot should resolve the provided date using the current year in the
user's configured timezone.

### 2.10.1 Completed Workday

If the record contains both start and end times:

``` txt
Record for 12-06

Start: 08:15
End: 17:30
Worked: 09:15
```

### 2.10.2 Open Workday

If only the start time exists:

``` txt
Record for 12-06

Start: 08:15
End: Not set
Status: Open
```

### 2.10.3 No Record

``` txt
No record found for 12-06.
```

### 2.10.4 Absence Record

``` txt
Record for 12-06

Status: Vacation
```

Supported absence types:

-   Sick
-   Vacation
-   Holiday
-   Holiday Eve
-   Unpaid Absence
-   Election Day

------------------------------------------------------------------------

## 4. Bot Commands

Add:

  Command           Description
  ----------------- -------------------------------------
  `/record dd-mm`   Show the record for a specific date

------------------------------------------------------------------------

## 7. Success Criteria

Add:

-   `/record dd-mm` displays the record for a specific date.
-   Completed workdays show start time, end time, and worked duration.
-   Open workdays show the start time and indicate that the workday is
    still open.
-   Absence records display the absence type.
-   Dates without a record return a clear "No record found" message.
