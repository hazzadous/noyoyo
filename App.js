import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, TextInput, FlatList, Pressable } from 'react-native';
import React, { useState, useEffect } from "react";
import * as SQLite from "expo-sqlite";
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Header } from '@rneui/themed';


// The app provides a single screen that shows a months weight loss trend in a
// spreadsheet like format. At the top we display the month for which we are
// showing the data. Below that we show the weight trend data, one row per day.
// The first column shows the date, the next 9 columns show the trend data. Only
// one of the trend columns will be filled with an X, the rest will be empty.
// The middle column of the 9 represents the target weight loss for the month.
// The column to the right of the middle column represents the weight at the
// beginning of the month.

// The user can tap on any of the trend columns to enter their weight for that
// day. They can also tap on the comment cell to enter a comment for that day.

// The user can swipe left or right to move to the previous or next month.

// The app uses a single SQLite table to store the data. The table has the
// following columns:

//  * id - a unique id for the row
//  * date - the date for the row, in the format YYYY-MM-DD
//  * weight - the weight for the day
//  * comment - a comment for the day

// The app will only ever have one row per day, so the date column is the
// primary key for the table.

const db = SQLite.openDatabase("db.db");

export default function App() {
  const [month, setMonth] = useState(new Date());
  const [data, setData] = useState([]);

  useEffect(() => {
    db.transaction((tx) => {
      tx.executeSql(
        `create table if not exists items (
          date text primary key not null,
          weight numeric,
          comment text
        );`
      );
    });
  }, []);

  const refreshData = async () => {
    // Get the data for the current month. We do not know if there is data for
    // every day in the month, so we fill in any missing days with empty rows.
    return await new Promise((resolve, reject) => {
      db.transaction((tx) => {
        tx.executeSql(
          "select * from items where date like ? order by date asc",
          [`${month.getFullYear()}-${month.getMonth() + 1}%`],
          (_, { rows: { _array } }) => {
            const days = getDaysInMonth();
            const newData = [];
            for (let i = 1; i <= days; i++) {
              const date = `${month.getFullYear()}-${month.getMonth() + 1}-${i}`;
              const item = _array.find((i) => i.date === date);
              if (item) {
                newData.push(item);
              } else {
                newData.push({ date });
              }
            }
            setData(newData);
            resolve(newData);
          },
          (_, error) => {
            console.log(error);
            reject(error);
          }
        );
      })
    })
  }

  useEffect(() => {
    refreshData();
  }, [month]);

  const monthStart = () => {
    const m = new Date(month);
    return `${m.getFullYear()}-${m.getMonth() + 1}-01`;
  }

  const monthEnd = () => {
    const m = new Date(month);
    return `${m.getFullYear()}-${m.getMonth() + 1}-${new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate()}`;
  }

  const nextMonth = () => {
    const m = new Date(month);
    m.setMonth(m.getMonth() + 1);
    setMonth(m);
  }

  const prevMonth = () => {
    const m = new Date(month);
    m.setMonth(m.getMonth() - 1);
    setMonth(m);
  }

  const updateItem = async (date, weight, comment) => {
    await new Promise((resolve, reject) => {
      db.transaction((tx) => {
        // Insert or update the item. We use the date as the primary key, so if
        // the date already exists, the row will be updated, otherwise it will be
        // inserted.
        // Make sure to log errors
        tx.executeSql(
          "insert or replace into items (date, weight, comment) values (?, ?, ?)",
          [date, weight, comment],
          (_, result) => {
            resolve(result);
          },
          (_, error) => {
            console.log(error);
            reject(error);
          }
        );
      });
    })
    await refreshData();
  }

  const getDaysInMonth = () => {
    return new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  }

  const getInitialWeight = () => {
    const firstDay = data.find((i) => i.weight);
    if (firstDay) {
      return firstDay.weight;
    } else {
      return 0;
    }
  }

  return (
    <SafeAreaProvider>
      <Header centerComponent={{
        text: `${month.toLocaleString('default', { month: 'long' })} ${month.getFullYear()}`, style: { color: '#fff', fontSize: 20, fontWeight: 'bold' }
      }} />
      <FlatList data={data} renderItem={({ item }) => <Item initialWeight={getInitialWeight()} item={item} updateItem={updateItem} />} keyExtractor={(item) => item.date} contentContainerStyle={styles.list} />
      <StatusBar style="auto" />
    </SafeAreaProvider>
  );
}

// An Item represents a single row in the spreadsheet. It shows the date, the
// weight for the day, and a comment for the day.
const Item = ({ initialWeight, item, updateItem }) => {
  const [weight, setWeight] = useState(item.weight);
  const [comment, setComment] = useState(item.comment);
  const [editing, setEditing] = useState(false);
  const weightRef = React.useRef();

  const saveItem = async () => {
    await updateItem(item.date, weight, comment);
    setEditing(false);
  }

  useEffect(() => {
    if (editing && weightRef.current) {
      weightRef.current.focus();
    }
  }, [editing, weightRef.current]);

  // Use flex to lay out the row. The items should fill the width of the screen
  // and grow to fill the available space. Display the date as the 1st, 2nd,
  // etc. Make sure that the weight column is only a number.
  return (
    <View style={{ flexDirection: "row", alignItems: "stretch", width: "100%", height: 30, borderColor: 'lightgray', borderBottomWidth: 1 }}>
      <Text style={{
        backgroundColor: "lightyellow",
        flex: 1,
        textAlign: "right",
        paddingRight: 5,
        textAlignVertical: "center",
        lineHeight: 30,
        fontWeight: "bold"
      }}>
        {getDayStringFromDate(new Date(item.date))}
      </Text>

      {editing ? (
        <TextInput
          style={{ borderColor: 'gray', borderWidth: 1, flex: 4 }}
          onChangeText={setWeight}
          value={weight?.toString() ?? ""}
          keyboardType="numeric"
          onBlur={saveItem}
          ref={weightRef}
        />) :
        <Pressable onPress={() => setEditing(true)} style={{ flex: 4, alignItems: "stretch", flexDirection: "row" }}>
          <WeightTrend initialWeight={initialWeight} item={item} />
        </Pressable>
      }

      <TextInput
        style={{ height: 30, flex: 3, padding: 5 }}
        onChangeText={setComment}
        value={comment}
        onBlur={saveItem}
      />
    </View>
  );
}

const WeightTrend = ({ initialWeight, item }) => {
  // Given the initial weight, and the item for the day, return 9 boxes, one of
  // which will be filled with an X. The X will be in the box that represents
  // the difference between the initial weight and the weight for the day.
  // The 6th box represents the initial weight, the 5th box represents the
  // target weight loss for the month.
  //
  // On tapping the component, the user should be able to enter their weight
  // for the day.
  const boxes = [];
  for (let i = 0; i < 9; i++) {
    boxes.push(<View key={i} style={{ width: 20, backgroundColor: 'lightgray', marginRight: 1 }}></View>);
  }
  const diff = item.weight - initialWeight;
  const index = Math.round(diff);
  boxes[4] = <View key={4} style={{ width: 20, backgroundColor: '#eee', marginRight: 1 }}></View>;
  boxes[index + 5] = <View key={index + 5} style={{ width: 20, backgroundColor: 'gray', marginRight: 1 }}></View>;
  return (
    <>
      {boxes}
    </>
  );
}

const getDayStringFromDate = (date) => {
  // Gets the day of the month as 1st, 2nd, 3rd, etc.
  const day = date.getDate();
  if (day === 1 || day === 21 || day === 31) {
    return `${day}st`;
  } else if (day === 2 || day === 22) {
    return `${day}nd`;
  } else if (day === 3 || day === 23) {
    return `${day}rd`;
  } else {
    return `${day}th`;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    width: "100%",
  },
  list: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',

  }
});
