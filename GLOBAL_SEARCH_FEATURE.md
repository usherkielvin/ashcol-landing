# Global Search Feature Documentation

## Overview

The Global Search Engine is a powerful feature added to the ASHCOL Portal Overview Dashboard that enables admins and managers to quickly search and view customer, service, and ticket information across the entire system.

## Features

### 🔍 Search Capabilities

The global search can find records by searching across multiple fields:

**Customer Information:**
- Customer name
- Contact number
- Address
- District

**Ticket Information:**
- Ticket number
- Service type
- Status
- Assigned technician
- Branch/location

**Service Report Information:**
- Control number
- Service type
- AC type / unit brand and model
- Store/account (e.g., Robinsons)
- Dealer
- Technician name
- Job status
- Payment status
- Report date
- Remarks and notes

### 🎯 Key Features

1. **Real-time Search**: Results appear instantly as you type (300ms debounce)
2. **Keyword Highlighting**: Matched keywords are highlighted in yellow in search results
3. **Smart Filtering**: Filter results by type (Tickets vs Service Reports)
4. **Detailed View**: Click any result to see complete information in a modal
5. **Service History Timeline**: View chronological activity for each record
6. **Mobile Responsive**: Works seamlessly on all device sizes
7. **Case-Insensitive**: Search works regardless of letter casing
8. **Partial Matching**: Find results even with incomplete keywords

## User Interface

### Search Bar

Located at the top of the Overview Dashboard (visible only to admins and managers):

```
┌─────────────────────────────────────────────────────────────┐
│ 🔍 Search customer name, ticket number, branch, store...   │
└─────────────────────────────────────────────────────────────┘
```

**Features:**
- Blue border when focused
- Loading spinner during search
- Clear button (X) to reset search
- Dropdown results panel

### Search Results Panel

When you type, a dropdown appears showing:

**Header:**
- Filter chips: "Tickets (X)" and "Service Reports (Y)"
- Clear filters button

**Result Cards:**
Each result shows:
- Icon (blue for tickets, green for service reports)
- Customer name (with highlighted matches)
- Status badge (color-coded)
- Key details in a grid:
  - Ticket/Control number
  - Branch
  - Service type
  - Technician
  - AC type
  - Store/account
  - Last updated date
- "View Details →" link

**Footer:**
- Result count: "Showing X results"

### Detail Modal

Clicking "View Details" opens a comprehensive modal with:

**Header:**
- Type icon and title
- Ticket/Control number
- Close button

**Content Sections:**

1. **Customer Information**
   - Name
   - Contact number (clickable to call)
   - Address with map pin icon
   - District

2. **Service Information**
   - Service type
   - Status badge
   - Branch
   - Store/Account
   - Assigned technician

3. **Unit Details** (if available)
   - AC type / Brand
   - Serial number
   - Quantity

4. **Payment Information** (if available)
   - Amount charged (formatted as ₱X,XXX.XX)
   - Payment status

5. **Remarks/Notes**
   - Full text of remarks or notes

6. **Service History Timeline**
   - Chronological list of events
   - Color-coded icons
   - Timestamps for each event
   - Examples:
     - Ticket created
     - Assigned to technician
     - Service started
     - Service ended
     - Service completed

7. **Advanced Data** (collapsible)
   - Raw JSON data for debugging

**Footer:**
- Last updated timestamp
- Close button

## Technical Implementation

### Components

#### 1. GlobalSearch.tsx
Main search component with:
- Search input with debouncing
- Results dropdown
- Filter chips
- Keyword highlighting
- Empty states and loading states

**Key Functions:**
- `performSearch()`: Fetches data from multiple API endpoints
- `highlightMatch()`: Highlights matched keywords in results
- `getStatusColor()`: Returns color based on status

#### 2. SearchResultDetailModal.tsx
Detail view modal with:
- Comprehensive information display
- Service history timeline
- Responsive grid layout
- Collapsible raw data section

**Key Functions:**
- `buildTimeline()`: Constructs chronological event timeline
- `formatDateTime()`: Formats dates for display
- `getStatusColor()`: Status-based color coding

#### 3. Dashboard.tsx Integration
- Search bar positioned at top for admin/manager users
- State management for selected result
- Modal trigger on result click

### API Integration

The search queries two main endpoints:

1. **Tickets API**
   ```
   GET /api/tickets?search={query}&size=50
   ```

2. **Service Reports API**
   ```
   GET /api/v1/service-reports?search={query}
   ```

**Note:** The backend APIs need to support the `search` query parameter for full functionality. If not yet implemented, the search will work with client-side filtering of loaded data.

### Data Flow

```
User types → Debounce (300ms) → API calls → Parse results → 
Display in dropdown → User clicks → Show detail modal
```

### Styling

- Uses theme context for light/dark mode
- Consistent with existing ASHCOL design system
- Color palette:
  - Primary: #3B82F6 (blue)
  - Success: #10B981 (green)
  - Warning: #F59E0B (orange)
  - Error: #EF4444 (red)
  - Purple: #8B5CF6

## Usage Examples

### Example 1: Search by Customer Name
```
User types: "Juan Dela Cruz"
Results: All tickets and service reports for customers matching "Juan"
```

### Example 2: Search by Branch
```
User types: "Robinsons"
Results: All records assigned to Robinsons stores
```

### Example 3: Search by Technician
```
User types: "Mario"
Results: All tickets/services assigned to technicians named Mario
```

### Example 4: Search by AC Type
```
User types: "Daikin"
Results: All service reports for Daikin units
```

### Example 5: Search by Status
```
User types: "completed"
Results: All completed tickets and services
```

## User Roles

### Admin
- Full access to global search
- Can see all branches and stores
- Can view all customer records

### Manager
- Full access to global search
- Can see their branch's records
- Can view assigned technicians' work

### Staff
- No access to global search (can be enabled if needed)

### Customer/Employee
- No access to global search
- Have their own specialized dashboards

## Performance Considerations

1. **Debouncing**: 300ms delay prevents excessive API calls
2. **Result Limit**: Maximum 50 results per endpoint
3. **Lazy Loading**: Modal content loads only when opened
4. **Efficient Rendering**: Uses React best practices

## Future Enhancements

Potential improvements for future versions:

1. **Advanced Filters**
   - Date range picker
   - Branch multi-select
   - Status multi-select
   - Service type filter

2. **Search History**
   - Recent searches
   - Saved searches
   - Search suggestions

3. **Export Functionality**
   - Export search results to Excel
   - Print search results

4. **Pagination**
   - Load more results
   - Infinite scroll

5. **Search Analytics**
   - Track popular searches
   - Search performance metrics

6. **Voice Search**
   - Speech-to-text search input

7. **Barcode/QR Scanner**
   - Scan control numbers or ticket IDs

## Troubleshooting

### Search returns no results
- Check if backend APIs support the `search` parameter
- Verify user has proper authentication token
- Check network connectivity
- Verify data exists in the system

### Search is slow
- Check network speed
- Verify backend API performance
- Consider reducing result limit
- Check for large datasets

### Modal doesn't open
- Check browser console for errors
- Verify result data structure
- Check for JavaScript errors

## Code Maintenance

### Adding New Searchable Fields

To add a new field to search:

1. Update the `SearchResult` interface in `GlobalSearch.tsx`
2. Add field to the result card display
3. Add field to the detail modal
4. Update backend API to include field in search

### Modifying the Timeline

To add new timeline events:

1. Update `buildTimeline()` in `SearchResultDetailModal.tsx`
2. Add new event type with icon and color
3. Update the timeline rendering logic

### Changing Styles

All styles use inline styles with theme variables:
- `cardBg`: Card background color
- `border`: Border color
- `textPrimary`: Primary text color
- `textMuted`: Muted text color
- `inputBg`: Input background color

## Testing Checklist

- [ ] Search with customer name
- [ ] Search with ticket number
- [ ] Search with branch name
- [ ] Search with technician name
- [ ] Search with AC type
- [ ] Search with partial keywords
- [ ] Test filter chips
- [ ] Test clear filters
- [ ] Test clear search
- [ ] Open detail modal
- [ ] View all sections in modal
- [ ] Check timeline display
- [ ] Test on mobile device
- [ ] Test in light mode
- [ ] Test in dark mode
- [ ] Test with no results
- [ ] Test with loading state
- [ ] Test clicking outside to close

## Support

For issues or questions about the global search feature:
1. Check this documentation
2. Review the code comments
3. Check browser console for errors
4. Contact the development team

---

**Version:** 1.0.0  
**Last Updated:** May 28, 2026  
**Author:** ASHCOL Development Team
